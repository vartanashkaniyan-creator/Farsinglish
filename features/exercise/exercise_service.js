// exercise_service.js v4.0
import { normalize_text, sanitize_text } from './utils/text_utils.js';
import { CONFIG } from './config.js';
import { rate_limit } from './utils/rate_limiter.js';

/**
 * Error Classes
 */
export class ExerciseError extends Error {}
export class ValidationError extends ExerciseError {}
export class ExerciseNotFoundError extends ExerciseError {}

/**
 * ExerciseRequestDTO
 */
export class ExerciseRequestDTO {
  constructor(data) {
    if (!data) throw new ValidationError('ExerciseRequestDTO data is required');
    this.lesson_id = data.lesson_id || '';
    this.type = data.type || 'multiple-choice';
    this.difficulty = data.difficulty || 'intermediate';
    this.count = data.count > 0 ? data.count : 1;
    this.exclude_exercises = data.exclude_exercises || [];
    this.options = {
      shuffle: data.options?.shuffle !== false,
      include_media: data.options?.include_media || false,
      time_limit: Math.max(0, data.options?.time_limit || 0)
    };
    Object.freeze(this);
  }

  to_exercise_params() {
    return {
      lesson_id: this.lesson_id,
      type: this.type,
      difficulty: this.difficulty,
      count: this.count,
      exclude_ids: this.exclude_exercises,
      shuffle: this.options.shuffle,
      include_media: this.options.include_media,
      time_limit: this.options.time_limit
    };
  }
}

/**
 * Levenshtein Typo Analyzer using Web Worker
 */
export class LevenshteinTypoAnalyzer {
  constructor() {
    this.cache = new Map();
    this.worker_available = typeof Worker !== 'undefined';
  }

  async calculate_levenshtein_distance(str1, str2) {
    if (!str1 && !str2) return 0;
    if (!str1) return str2.length;
    if (!str2) return str1.length;

    const key = `${str1}|${str2}`;
    if (this.cache.has(key)) return this.cache.get(key);

    let distance;
    if (this.worker_available) {
      try {
        distance = await this._calculate_with_worker(str1, str2);
      } catch (e) {
        console.warn('Worker failed, fallback to main thread', e);
        distance = this._calculate_sync(str1, str2);
      }
    } else {
      distance = this._calculate_sync(str1, str2);
    }

    this.cache.set(key, distance);
    return distance;
  }

  _calculate_sync(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  _calculate_with_worker(a, b) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./workers/levenshtein_worker.js', import.meta.url));
      worker.postMessage({ a, b });
      worker.onmessage = (e) => {
        resolve(e.data);
        worker.terminate();
      };
      worker.onerror = (err) => {
        reject(err);
        worker.terminate();
      };
    });
  }

  async analyze_typo(user_answer, correct_answer, variations = []) {
    user_answer = sanitize_text(user_answer);
    const candidates = [correct_answer, ...variations];
    let best = { distance: Infinity, suggestion: correct_answer };

    for (const v of candidates) {
      const distance = await this.calculate_levenshtein_distance(user_answer, v);
      if (distance < best.distance) best = { distance, suggestion: v };
    }

    const max_length = Math.max(user_answer?.length || 0, best.suggestion?.length || 0);
    const similarity = max_length === 0 ? 100 : ((max_length - best.distance) / max_length) * 100;

    return {
      has_typo: best.distance > 0 && similarity >= CONFIG.TYPO_THRESHOLD_MAJOR,
      is_minor_typo: similarity >= CONFIG.TYPO_THRESHOLD_MINOR,
      distance: best.distance,
      similarity_percentage: Math.round(similarity * 100) / 100,
      suggestion: best.suggestion
    };
  }
}

/**
 * Exercise Generator
 */
export class ExerciseGenerator {
  constructor(validator) {
    if (!validator) throw new ValidationError('Validator is required');
    this.validator = validator;
  }

  generate_exercise = rate_limit((lesson, options = {}) => {
    if (!lesson || !lesson.vocabulary?.length) throw new ValidationError('درس معتبر نیست');

    const type = options.type || this._select_random_type();
    const difficulty = options.difficulty || lesson.difficulty || 'intermediate';
    const exclude_ids = options.exclude_ids || [];

    const vocab_candidates = lesson.vocabulary.filter(v => !exclude_ids.includes(v.id));
    if (!vocab_candidates.length) throw new ExerciseNotFoundError('هیچ واژه‌ای موجود نیست');

    const selected = vocab_candidates[Math.floor(Math.random() * vocab_candidates.length)];
    if (!selected) throw new ExerciseNotFoundError('تمرین انتخاب نشده');

    const exercise = this._generate_exercise_by_type(selected, vocab_candidates, type, difficulty);

    return {
      ...exercise,
      lesson_id: lesson.id,
      generated_at: new Date().toISOString(),
      source: 'exercise_service',
      options_used: options
    };
  });

  generate_multiple_exercises(lesson, count, options = {}) {
    const exercises = [];
    const used_ids = new Set();
    let tries = 0;

    while (exercises.length < count && tries < CONFIG.MAX_GENERATE_TRIES * count) {
      tries++;
      const ex = this.generate_exercise(lesson, { ...options, exclude_ids: Array.from(used_ids) });
      if (ex && ex.id && !used_ids.has(ex.id)) {
        exercises.push(ex);
        used_ids.add(ex.id);
      }
    }

    return exercises;
  }

  _select_random_type() {
    const types = ['multiple-choice', 'fill-blank', 'translation'];
    const weights = [0.5, 0.3, 0.2];
    const rnd = Math.random();
    let cum = 0;
    for (let i = 0; i < types.length; i++) {
      cum += weights[i];
      if (rnd < cum) return types[i];
    }
    return 'multiple-choice';
  }

  _shuffle_array(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  _generate_exercise_by_type(selected, vocab, type, difficulty) {
    switch (type) {
      case 'multiple-choice':
        return this._generate_multiple_choice(selected, vocab, difficulty);
      case 'fill-blank':
        return this._generate_fill_blank(selected, difficulty);
      case 'translation':
        return this._generate_translation(selected, vocab, difficulty);
      default:
        return this._generate_multiple_choice(selected, vocab, difficulty);
    }
  }

  _generate_multiple_choice(selected, vocab, difficulty) {
    const options = [selected.word, ...this._generate_options(selected.word, vocab, 3)];
    return { id: selected.id, question: selected.word, options: this._shuffle_array(options), type: 'multiple-choice', difficulty };
  }

  _generate_fill_blank(selected, difficulty) {
    // حذف حروف صدادار فارسی و انگلیسی و سایر کاراکترهای صوتی
    const question = selected.word.replace(/[aeiouآایىء]/gi, '_');
    return { id: selected.id, question, type: 'fill-blank', difficulty };
  }

  _generate_translation(selected, vocab, difficulty) {
    const options = this._generate_options(selected.translation, vocab, 3, 'translation');
    return { id: selected.id, question: selected.word, options: this._shuffle_array([selected.translation, ...options]), type: 'translation', difficulty };
  }

  _generate_options(correct, vocab, count = 3, key = 'word') {
    const other = vocab.map(v => v[key]).filter(w => w !== correct);
    const options = [];
    const used = new Set([correct]);
    while (options.length < count && options.length < other.length) {
      const candidate = other[Math.floor(Math.random() * other.length)];
      if (candidate && !used.has(candidate)) {
        options.push(candidate);
        used.add(candidate);
      }
    }
    return options;
  }
  }
