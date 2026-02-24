// content_validator.js

/**
 * @fileoverview پیشرفته‌ترین Validator برای content درس
 * @version 1.0.0
 */

class ValidationResult {
  constructor(is_valid = true, errors = []) {
    this.is_valid = is_valid;
    this.errors = errors; // { message: string, severity: 'error' | 'warning' }
  }

  merge(other) {
    this.errors.push(...other.errors);
    this.is_valid = this.errors.length === 0;
    return this;
  }
}

// ===== Rule Base Class =====
class Rule {
  /**
   * @param {Object} content
   * @returns {ValidationResult}
   */
  validate(content) {
    throw new Error('Rule.validate باید override شود');
  }
}

// ===== Specific Rules =====
class RequiredFieldsRule extends Rule {
  validate(content) {
    const errors = [];
    if (!content.vocabulary) errors.push({ message: 'content.vocabulary وجود ندارد', severity: 'error' });
    if (!content.exercises) errors.push({ message: 'content.exercises وجود ندارد', severity: 'error' });
    return new ValidationResult(errors.length === 0, errors);
  }
}

class UniqueIdRule extends Rule {
  validate(content) {
    const errors = [];
    const vocab = content.vocabulary || [];
    const ids = vocab.map(v => v.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push({ message: `Duplicate IDs: ${[...new Set(duplicates)].join(', ')}`, severity: 'error' });
    }
    return new ValidationResult(errors.length === 0, errors);
  }
}

class DifficultyRangeRule extends Rule {
  validate(content) {
    const errors = [];
    const vocab = content.vocabulary || [];
    vocab.forEach((v, i) => {
      if (v.difficulty < 1 || v.difficulty > 5) {
        errors.push({ message: `vocabulary[${i}].difficulty باید بین 1-5 باشد`, severity: 'error' });
      }
    });
    return new ValidationResult(errors.length === 0, errors);
  }
}

class LogicalRelationsRule extends Rule {
  validate(content) {
    const errors = [];
    const vocab = content.vocabulary || [];
    vocab.forEach((v, i) => {
      if (Array.isArray(v.synonyms) && v.synonyms.includes(v.word)) {
        errors.push({ message: `vocabulary[${i}].synonyms نمی‌تواند شامل خود word باشد`, severity: 'error' });
      }
      if (Array.isArray(v.antonyms) && v.antonyms.includes(v.word)) {
        errors.push({ message: `vocabulary[${i}].antonyms نمی‌تواند شامل خود word باشد`, severity: 'error' });
      }
    });
    return new ValidationResult(errors.length === 0, errors);
  }
}

class ExamplesNotEmptyRule extends Rule {
  validate(content) {
    const errors = [];
    const vocab = content.vocabulary || [];
    vocab.forEach((v, i) => {
      (v.examples || []).forEach((ex, j) => {
        if (!ex.en?.trim() || !ex.fa?.trim()) {
          errors.push({ message: `vocabulary[${i}].examples[${j}] نمی‌تواند خالی باشد`, severity: 'error' });
        }
      });
    });
    return new ValidationResult(errors.length === 0, errors);
  }
}

// ===== ContentValidator =====
export class ContentValidator {
  /**
   * @param {Rule[]} rules - ruleهای سفارشی یا پیش‌فرض
   */
  constructor(rules = []) {
    this.rules = rules.length ? rules : this._get_default_rules();
  }

  _get_default_rules() {
    return [
      new RequiredFieldsRule(),
      new UniqueIdRule(),
      new DifficultyRangeRule(),
      new LogicalRelationsRule(),
      new ExamplesNotEmptyRule(),
    ];
  }

  /**
   * اعتبارسنجی عمیق content
   * @param {Object} content
   * @param {Object} options
   * @param {boolean} options.stop_on_first_error - اگر true اولین خطا کافی است
   * @returns {ValidationResult}
   */
  validate_deep(content, options = { stop_on_first_error: false }) {
    const result = new ValidationResult(true, []);
    for (const rule of this.rules) {
      const rule_result = rule.validate(content);
      result.merge(rule_result);
      if (options.stop_on_first_error && rule_result.errors.length > 0) break;
    }
    return result;
  }
}
