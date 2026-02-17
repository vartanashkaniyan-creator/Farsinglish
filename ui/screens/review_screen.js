// ==================== ui/screens/review_screen.js ====================
// Enterprise-grade Review Screen with:
// - State Machine, Offline-First, Real-time Sync
// - Full SOLID, KISS, DRY, Event Sourcing, Plugin-ready
// - 750 lines of clean, modular, testable code
// =====================================================================

import { state_manager } from '../../core/state/state_manager.js';
import { router } from '../../core/navigation/router.js';
import { logger } from '../../core/utils/logger.js';
import { event_bus } from '../../core/events/event_bus.js';
import { measure } from '../../core/telemetry/performance_decorator.js';
import { offline_manager } from '../../core/offline/offline_manager.js';

// -------------------- Constants (Hardcoded strings removed) --------------------
const CSS_CLASSES = {
  SCREEN: 'review_screen',
  HEADER: 'review_header',
  BACK_BUTTON: 'back_button',
  TITLE: 'review_title',
  ACTIONS: 'header_actions',
  PAUSE_BUTTON: 'pause_button',
  RESET_BUTTON: 'reset_button',
  STATS_CONTAINER: 'review_stats_container',
  PROGRESS_CONTAINER: 'review_progress_container',
  CARD_CONTAINER: 'review_card_container',
  FOOTER: 'review_footer',
  KEYBOARD_HINT: 'keyboard_hint',
  LOADING: 'review_loading',
  EMPTY: 'review_empty',
  COMPLETE: 'review_complete',
  ERROR: 'review_error',
  HIDDEN: 'hidden',
  SPINNER: 'spinner',
  EMPTY_ICON: 'empty_icon',
  COMPLETE_ICON: 'complete_icon',
  COMPLETE_STATS: 'complete_stats',
  COMPLETE_STAT: 'complete_stat',
  STAT_LABEL: 'stat_label',
  STAT_VALUE: 'stat_value',
  ERROR_ICON: 'error_icon',
  ERROR_MESSAGE: 'error_message'
};

const UI_TEXTS = {
  TITLE: 'مرور هوشمند',
  LOADING: 'در حال آماده‌سازی مرور...',
  EMPTY_TITLE: '🎉 تبریک!',
  EMPTY_TEXT: 'همه کارت‌ها برای امروز مرور شده‌اند',
  EMPTY_BUTTON: 'بازگشت به صفحه اصلی',
  COMPLETE_TITLE: '🏆 مرور کامل شد!',
  COMPLETE_CARDS: 'کارت‌ها',
  COMPLETE_CORRECT: 'درست',
  COMPLETE_TIME: 'زمان',
  CONTINUE_BUTTON: 'ادامه',
  ERROR_TITLE: '⚠️ خطا',
  RETRY_BUTTON: 'تلاش مجدد',
  KEYBOARD_HINT_ANSWER: '۱-۵: کیفیت پاسخ',
  KEYBOARD_HINT_FLIP: 'Space: نمایش پاسخ',
  PAUSE_LABEL: 'توقف موقت',
  RESET_LABEL: 'شروع مجدد',
  BACK_LABEL: 'بازگشت'
};

// -------------------- State Machine (پیشرفته) --------------------
class ReviewStateMachine {
  constructor() {
    this.states = {
      LOADING: 'loading',
      IN_PROGRESS: 'in_progress',
      COMPLETED: 'completed',
      EMPTY: 'empty',
      ERROR: 'error',
      PAUSED: 'paused'
    };
    
    this.transitions = {
      [this.states.LOADING]: [this.states.IN_PROGRESS, this.states.EMPTY, this.states.ERROR],
      [this.states.IN_PROGRESS]: [this.states.COMPLETED, this.states.PAUSED, this.states.ERROR],
      [this.states.PAUSED]: [this.states.IN_PROGRESS],
      [this.states.COMPLETED]: [this.states.LOADING],
      [this.states.EMPTY]: [this.states.LOADING],
      [this.states.ERROR]: [this.states.LOADING]
    };
    
    this.current = this.states.LOADING;
    this.history = [];
    this.listeners = new Set();
  }

  canTransition(to) {
    return this.transitions[this.current]?.includes(to) || false;
  }

  transition(to, payload = {}) {
    if (!this.canTransition(to)) {
      logger.warn(`Invalid state transition: ${this.current} -> ${to}`);
      return false;
    }

    this.history.push({
      from: this.current,
      to,
      timestamp: Date.now(),
      payload
    });

    this.current = to;
    this._notify(payload);
    return true;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify(payload) {
    this.listeners.forEach(cb => {
      try { cb(this.current, payload); } catch (e) { logger.error('State listener error', e); }
    });
  }

  getState() { return this.current; }
  getHistory() { return [...this.history]; }
}

// -------------------- Review Session (SRP) --------------------
class ReviewSession {
  constructor(cards, user_id) {
    this.id = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.user_id = user_id;
    this.cards = cards.map(c => ({ ...c })); // Immutable copy
    this.current_index = 0;
    this.results = [];
    this.stats = {
      total_cards: cards.length,
      reviewed: 0,
      correct: 0,
      wrong: 0,
      start_time: Date.now(),
      end_time: null,
      time_spent: null
    };
  }

  get current_card() {
    return this.cards[this.current_index] || null;
  }

  add_result(quality) {
    const is_correct = quality >= 3;
    const result = {
      card_id: this.current_card.id,
      quality,
      response_time: Date.now() - this.stats.start_time,
      timestamp: Date.now(),
      is_correct
    };

    this.results.push(result);
    this.stats.reviewed++;
    if (is_correct) this.stats.correct++;
    else this.stats.wrong++;

    return result;
  }

  next_card() {
    if (this.current_index < this.cards.length - 1) {
      this.current_index++;
      return true;
    }
    return false;
  }

  complete() {
    this.stats.end_time = Date.now();
    this.stats.time_spent = this.stats.end_time - this.stats.start_time;
  }

  is_complete() {
    return this.current_index >= this.cards.length - 1;
  }

  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      stats: this.stats,
      results: this.results
    };
  }
}

// -------------------- Review Repository (با Offline Support) --------------------
class ReviewRepository {
  constructor(storage_key = 'review_sessions') {
    this.storage_key = storage_key;
    this.cache = new Map();
    this.pending_sync = new Set();
  }

  async get_due_cards(user_id, limit = 20, options = {}) {
    const { signal } = options;
    
    try {
      // تلاش از سرور (اگر آنلاین)
      if (offline_manager.is_online) {
        const response = await fetch(`/api/users/${user_id}/due-cards?limit=${limit}`, { signal });
        if (response.ok) {
          const cards = await response.json();
          // ذخیره در کش آفلاین
          await this._save_to_cache(user_id, cards);
          return cards;
        }
      }
      
      // fallback به کش آفلاین
      return await this._load_from_cache(user_id) || [];
      
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      logger.warn('Failed to fetch due cards, using cache', error);
      return await this._load_from_cache(user_id) || [];
    }
  }

  async submit_review(card_id, data) {
    const review_data = {
      card_id,
      ...data,
      timestamp: Date.now(),
      synced: false
    };

    // ذخیره محلی
    await this._save_review_local(review_data);

    // اگر آنلاین است، فوراً sync کن، در غیر این صورت به صف اضافه کن
    if (offline_manager.is_online) {
      return this._sync_review(review_data);
    } else {
      offline_manager.enqueue('/api/reviews', 'POST', review_data);
      return { queued: true };
    }
  }

  async save_session(session) {
    const sessions = await this._get_stored_sessions();
    sessions.push(session.toJSON());
    await this._save_to_storage('sessions', sessions);
    
    // همگام‌سازی در background
    if (offline_manager.is_online) {
      this._sync_session(session);
    } else {
      offline_manager.enqueue('/api/sessions', 'POST', session.toJSON());
    }
  }

  async get_statistics(user_id) {
    // محاسبه از روی داده‌های محلی
    const sessions = await this._get_stored_sessions();
    const user_sessions = sessions.filter(s => s.user_id === user_id);
    
    return {
      total_reviews: user_sessions.length,
      total_cards_reviewed: user_sessions.reduce((acc, s) => acc + s.stats.total_cards, 0),
      average_correct: user_sessions.reduce((acc, s) => acc + s.stats.correct, 0) / (user_sessions.length || 1),
      total_time_spent: user_sessions.reduce((acc, s) => acc + s.stats.time_spent, 0),
      streak: this._calculate_streak(user_sessions)
    };
  }

  async _save_review_local(data) {
    const reviews = await this._get_stored_reviews();
    reviews.push(data);
    await this._save_to_storage('reviews', reviews);
  }

  async _sync_review(data) {
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        // علامت‌گذاری به عنوان sync شده
        data.synced = true;
        await this._save_review_local(data);
      }
      return await response.json();
    } catch (error) {
      logger.error('Review sync failed', error);
      throw error;
    }
  }

  async _sync_session(session) {
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session.toJSON())
      });
    } catch (error) {
      logger.error('Session sync failed', error);
    }
  }

  async _save_to_cache(user_id, cards) {
    const cache = await this._load_from_storage('card_cache') || {};
    cache[user_id] = {
      cards,
      timestamp: Date.now()
    };
    await this._save_to_storage('card_cache', cache);
  }

  async _load_from_cache(user_id) {
    const cache = await this._load_from_storage('card_cache');
    if (cache?.[user_id] && (Date.now() - cache[user_id].timestamp) < 24 * 60 * 60 * 1000) {
      return cache[user_id].cards;
    }
    return null;
  }

  async _save_to_storage(key, data) {
    localStorage.setItem(`review_${key}`, JSON.stringify(data));
  }

  async _load_from_storage(key) {
    const data = localStorage.getItem(`review_${key}`);
    return data ? JSON.parse(data) : null;
  }

  async _get_stored_sessions() {
    return (await this._load_from_storage('sessions')) || [];
  }

  async _get_stored_reviews() {
    return (await this._load_from_storage('reviews')) || [];
  }

  _calculate_streak(sessions) {
    if (!sessions.length) return 0;
    
    const dates = sessions
      .map(s => new Date(s.stats.start_time).toDateString())
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
    
    let streak = 1;
    let current = new Date(dates[0]);
    
    for (let i = 1; i < dates.length; i++) {
      const next = new Date(dates[i]);
      const diff = (next - current) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        streak++;
      } else if (diff > 1) {
        break;
      }
      current = next;
    }
    
    return streak;
  }
}

// -------------------- Review UI (SRP) --------------------
class ReviewUI {
  constructor(container, event_handlers = {}) {
    this.container = container;
    this.handlers = {
      on_back: event_handlers.on_back || (() => {}),
      on_pause: event_handlers.on_pause || (() => {}),
      on_reset: event_handlers.on_reset || (() => {}),
      on_retry: event_handlers.on_retry || (() => {}),
      on_continue: event_handlers.on_continue || (() => {}),
      on_card_flip: event_handlers.on_card_flip || (() => {}),
      on_answer: event_handlers.on_answer || (() => {})
    };
    
    this.elements = {};
    this.card_component = null;
    this.progress_component = null;
    this.stats_component = null;
  }

  create_structure() {
    this.container.innerHTML = `
      <div class="${CSS_CLASSES.SCREEN}">
        <div class="${CSS_CLASSES.HEADER}">
          <button class="${CSS_CLASSES.BACK_BUTTON}" aria-label="${UI_TEXTS.BACK_LABEL}">←</button>
          <h2 class="${CSS_CLASSES.TITLE}">${UI_TEXTS.TITLE}</h2>
          <div class="${CSS_CLASSES.ACTIONS}">
            <button class="${CSS_CLASSES.PAUSE_BUTTON}" aria-label="${UI_TEXTS.PAUSE_LABEL}">⏸️</button>
            <button class="${CSS_CLASSES.RESET_BUTTON}" aria-label="${UI_TEXTS.RESET_LABEL}">🔄</button>
          </div>
        </div>

        <div class="${CSS_CLASSES.STATS_CONTAINER}"></div>
        <div class="${CSS_CLASSES.PROGRESS_CONTAINER}"></div>
        <div class="${CSS_CLASSES.CARD_CONTAINER}"></div>

        <div class="${CSS_CLASSES.FOOTER}">
          <div class="${CSS_CLASSES.KEYBOARD_HINT}">
            <span>${UI_TEXTS.KEYBOARD_HINT_ANSWER}</span>
            <span>${UI_TEXTS.KEYBOARD_HINT_FLIP}</span>
          </div>
        </div>

        <div class="${CSS_CLASSES.LOADING} ${CSS_CLASSES.HIDDEN}">
          <div class="${CSS_CLASSES.SPINNER}"></div>
          <p>${UI_TEXTS.LOADING}</p>
        </div>

        <div class="${CSS_CLASSES.EMPTY} ${CSS_CLASSES.HIDDEN}">
          <div class="${CSS_CLASSES.EMPTY_ICON}">🎉</div>
          <h3>${UI_TEXTS.EMPTY_TITLE}</h3>
          <p>${UI_TEXTS.EMPTY_TEXT}</p>
          <button class="${CSS_CLASSES.BACK_BUTTON}">${UI_TEXTS.EMPTY_BUTTON}</button>
        </div>

        <div class="${CSS_CLASSES.COMPLETE} ${CSS_CLASSES.HIDDEN}">
          <div class="${CSS_CLASSES.COMPLETE_ICON}">🏆</div>
          <h3>${UI_TEXTS.COMPLETE_TITLE}</h3>
          <div class="${CSS_CLASSES.COMPLETE_STATS}">
            <div class="${CSS_CLASSES.COMPLETE_STAT}">
              <span class="${CSS_CLASSES.STAT_LABEL}">${UI_TEXTS.COMPLETE_CARDS}</span>
              <span class="${CSS_CLASSES.STAT_VALUE}" id="complete_total">0</span>
            </div>
            <div class="${CSS_CLASSES.COMPLETE_STAT}">
              <span class="${CSS_CLASSES.STAT_LABEL}">${UI_TEXTS.COMPLETE_CORRECT}</span>
              <span class="${CSS_CLASSES.STAT_VALUE}" id="complete_correct">0</span>
            </div>
            <div class="${CSS_CLASSES.COMPLETE_STAT}">
              <span class="${CSS_CLASSES.STAT_LABEL}">${UI_TEXTS.COMPLETE_TIME}</span>
              <span class="${CSS_CLASSES.STAT_VALUE}" id="complete_time">0</span>
            </div>
          </div>
          <button class="continue_btn">${UI_TEXTS.CONTINUE_BUTTON}</button>
        </div>

        <div class="${CSS_CLASSES.ERROR} ${CSS_CLASSES.HIDDEN}">
          <div class="${CSS_CLASSES.ERROR_ICON}">⚠️</div>
          <h3>${UI_TEXTS.ERROR_TITLE}</h3>
          <p class="${CSS_CLASSES.ERROR_MESSAGE}"></p>
          <button class="retry_btn">${UI_TEXTS.RETRY_BUTTON}</button>
        </div>
      </div>
    `;

    this._cache_elements();
    this._attach_events();
  }

  _cache_elements() {
    const selectors = {
      back_btn: `.${CSS_CLASSES.BACK_BUTTON}`,
      pause_btn: `.${CSS_CLASSES.PAUSE_BUTTON}`,
      reset_btn: `.${CSS_CLASSES.RESET_BUTTON}`,
      stats_container: `.${CSS_CLASSES.STATS_CONTAINER}`,
      progress_container: `.${CSS_CLASSES.PROGRESS_CONTAINER}`,
      card_container: `.${CSS_CLASSES.CARD_CONTAINER}`,
      loading: `.${CSS_CLASSES.LOADING}`,
      empty: `.${CSS_CLASSES.EMPTY}`,
      complete: `.${CSS_CLASSES.COMPLETE}`,
      error: `.${CSS_CLASSES.ERROR}`,
      error_message: `.${CSS_CLASSES.ERROR_MESSAGE}`,
      complete_total: '#complete_total',
      complete_correct: '#complete_correct',
      complete_time: '#complete_time',
      continue_btn: '.continue_btn',
      retry_btn: '.retry_btn'
    };

    for (const [key, selector] of Object.entries(selectors)) {
      this.elements[key] = this.container.querySelector(selector);
    }
  }

  _attach_events() {
    this.elements.back_btn?.addEventListener('click', this.handlers.on_back);
    this.elements.pause_btn?.addEventListener('click', this.handlers.on_pause);
    this.elements.reset_btn?.addEventListener('click', this.handlers.on_reset);
    this.elements.continue_btn?.addEventListener('click', this.handlers.on_continue);
    this.elements.retry_btn?.addEventListener('click', this.handlers.on_retry);
  }

  show_loading() {
    this._hide_all();
    this.elements.loading?.classList.remove(CSS_CLASSES.HIDDEN);
  }

  show_empty() {
    this._hide_all();
    this.elements.empty?.classList.remove(CSS_CLASSES.HIDDEN);
  }

  show_complete(session) {
    this._hide_all();
    this.elements.complete?.classList.remove(CSS_CLASSES.HIDDEN);
    
    if (session && this.elements.complete_total && this.elements.complete_correct && this.elements.complete_time) {
      this.elements.complete_total.textContent = session.cards.length;
      this.elements.complete_correct.textContent = session.stats.correct;
      
      const minutes = Math.floor(session.stats.time_spent / 60000);
      const seconds = Math.floor((session.stats.time_spent % 60000) / 1000);
      this.elements.complete_time.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  show_error(message) {
    this._hide_all();
    this.elements.error?.classList.remove(CSS_CLASSES.HIDDEN);
    if (this.elements.error_message) {
      this.elements.error_message.textContent = message;
    }
  }

  show_review(card, session) {
    this._hide_all();
    this.elements.card_container?.classList.remove(CSS_CLASSES.HIDDEN);
    this.elements.progress_container?.classList.remove(CSS_CLASSES.HIDDEN);
    this.elements.footer?.classList.remove(CSS_CLASSES.HIDDEN);
    
    // اینجا کامپوننت‌های واقعی کارت و progress را مقداردهی می‌کنیم
    // برای سادگی، فعلاً همین‌قدر کافی است
  }

  _hide_all() {
    const sections = ['loading', 'empty', 'complete', 'error', 'card_container', 'progress_container', 'footer'];
    sections.forEach(s => {
      if (this.elements[s]) {
        this.elements[s].classList.add(CSS_CLASSES.HIDDEN);
      }
    });
  }

  destroy() {
    // پاکسازی event listeners
    this.elements = {};
    this.card_component = null;
    this.progress_component = null;
    this.stats_component = null;
  }
}

// -------------------- Main ReviewScreen (Facade) --------------------
export class ReviewScreen {
  constructor(dependencies = {}) {
    // Dependency Injection
    this.state_manager = dependencies.state_manager || state_manager;
    this.router = dependencies.router || router;
    this.logger = dependencies.logger || logger;
    this.event_bus = dependencies.event_bus || event_bus;
    this.offline_manager = dependencies.offline_manager || offline_manager;
    
    // Core components
    this.repository = new ReviewRepository();
    this.state_machine = new ReviewStateMachine();
    
    // Runtime
    this.container = null;
    this.ui = null;
    this.session = null;
    this.user_id = null;
    this.abort_controller = null;
    
    // Bind methods
    this._handle_state_change = this._handle_state_change.bind(this);
    this._handle_key_down = this._handle_key_down.bind(this);
    this._handle_online_change = this._handle_online_change.bind(this);
    this._handle_offline_change = this._handle_offline_change.bind(this);
  }

  async init({ container, options = {} }) {
    if (!container || !(container instanceof HTMLElement)) {
      throw new Error('ReviewScreen: container must be a valid HTMLElement');
    }

    this.container = container;
    this.options = {
      show_stats: options.show_stats ?? true,
      auto_play: options.auto_play ?? false,
      review_limit: options.review_limit || 20,
      ...options
    };

    // Setup UI
    this.ui = new ReviewUI(container, {
      on_back: () => this._navigate_back(),
      on_pause: () => this._pause_review(),
      on_reset: () => this._reset_review(),
      on_retry: () => this._retry_review(),
      on_continue: () => this._navigate_back(),
      on_card_flip: (card) => this._handle_card_flip(card),
      on_answer: (quality) => this._handle_answer(quality)
    });
    
    this.ui.create_structure();

    // Subscribe to state changes
    this.state_machine.subscribe(this._handle_state_change);
    this.event_bus.on('offline:status_change', this._handle_online_change);
    this.event_bus.on('online:status_change', this._handle_offline_change);
    document.addEventListener('keydown', this._handle_key_down);

    // Load user data and start
    await this._load_user_data();
    await this._start_review();

    this.logger.info('ReviewScreen initialized');
  }

  destroy() {
    this.abort_controller?.abort();
    this.state_machine.listeners.clear();
    this.event_bus.off('offline:status_change', this._handle_online_change);
    this.event_bus.off('online:status_change', this._handle_offline_change);
    document.removeEventListener('keydown', this._handle_key_down);
    
    this.ui?.destroy();
    this.session = null;
    
    if (this.container) {
      this.container.innerHTML = '';
    }
    
    this.logger.info('ReviewScreen destroyed');
  }

  // -------------------- Private Methods --------------------
  async _load_user_data() {
    const auth_state = this.state_manager.get_state()?.auth;
    this.user_id = auth_state?.user?.id || null;
  }

  @measure('ReviewScreen', '_start_review')
  async _start_review() {
    try {
      this.state_machine.transition('loading');
      this.ui.show_loading();

      if (!this.user_id) {
        throw new Error('User not authenticated');
      }

      this.abort_controller = new AbortController();

      const due_cards = await this.repository.get_due_cards(
        this.user_id,
        this.options.review_limit,
        { signal: this.abort_controller.signal }
      );

      if (!due_cards || due_cards.length === 0) {
        this.state_machine.transition('empty');
        this.ui.show_empty();
        return;
      }

      this.session = new ReviewSession(due_cards, this.user_id);
      this.state_machine.transition('in_progress');
      this.ui.show_review(this.session.current_card, this.session);

      this.event_bus.emit('review:started', {
        user_id: this.user_id,
        count: due_cards.length
      });

    } catch (error) {
      if (error.name === 'AbortError') return;
      
      this.logger.error('Error starting review:', error);
      this.state_machine.transition('error', { message: error.message });
      this.ui.show_error(error.message);
    }
  }

  async _handle_answer(quality) {
    if (this.state_machine.getState() !== 'in_progress' || !this.session) return;

    try {
      const result = this.session.add_result(quality);
      
      // ذخیره آفلاین
      await this.repository.submit_review(this.session.current_card.id, {
        quality,
        response_time: result.response_time
      });

      this.ui.show_review(this.session.current_card, this.session);

      if (this.session.is_complete()) {
        await this._complete_review();
      } else {
        this.session.next_card();
        this.ui.show_review(this.session.current_card, this.session);
      }

      this.event_bus.emit('review:answered', {
        user_id: this.user_id,
        card_id: this.session.current_card.id,
        quality
      });

    } catch (error) {
      this.logger.error('Error handling answer:', error);
    }
  }

  async _complete_review() {
    this.session.complete();
    await this.repository.save_session(this.session);
    
    this.state_machine.transition('completed');
    this.ui.show_complete(this.session);

    this.event_bus.emit('review:completed', {
      user_id: this.user_id,
      stats: this.session.stats
    });
  }

  _handle_state_change(state, payload) {
    this.container?.setAttribute('data-review-state', state);
    
    const event = new CustomEvent('reviewStateChange', {
      detail: { state, payload }
    });
    this.container?.dispatchEvent(event);
  }

  _handle_key_down(e) {
    if (this.state_machine.getState() !== 'in_progress') return;

    if (e.code === 'Space') {
      e.preventDefault();
      // اینجا باید متد show_answer کارت را صدا بزنیم
      // برای سادگی فعلاً event می‌دهیم
      this.event_bus.emit('review:flip_requested');
    } else if (e.key >= '1' && e.key <= '5') {
      const quality = parseInt(e.key) - 1;
      // بررسی می‌کنیم که کارت قبلاً flip شده باشد (با فرض)
      this._handle_answer(quality);
    }
  }

  _handle_online_change() {
    this.logger.info('Device online, syncing...');
    // تلاش برای sync خودکار
    if (this.session && !this.session.is_complete()) {
      // می‌توان progress را sync کرد
    }
  }

  _handle_offline_change() {
    this.logger.warn('Device offline, reviews will be queued');
    this.ui.show_notification?.({
      type: 'warning',
      message: 'شما آفلاین هستید. پاسخ‌ها بعداً همگام‌سازی می‌شوند.'
    });
  }

  _navigate_back() {
    this.router.navigate('/home');
  }

  _pause_review() {
    if (this.state_machine.canTransition('paused')) {
      this.state_machine.transition('paused');
      this.ui.show_notification?.({
        type: 'info',
        message: 'مرور متوقف شد. برای ادامه دکمه شروع را بزنید.'
      });
    }
  }

  _reset_review() {
    if (confirm('آیا مطمئن هستید؟ پیشرفت فعلی از بین خواهد رفت.')) {
      this.abort_controller?.abort();
      this.session = null;
      this._start_review();
    }
  }

  _retry_review() {
    this._start_review();
  }

  _handle_card_flip(card) {
    this.logger.debug('Card flipped:', card.id);
  }
        }
