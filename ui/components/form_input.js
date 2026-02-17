```javascript
// ui/components/form_input.js

/**
 * ==================================================
 * کامپوننت پیشرفته ورودی فرم با قابلیت‌های حرفه‌ای
 * طراحی شده بر اساس اصول SOLID، KISS، DRY و YAGNI
 * ویژگی‌ها: اعتبارسنجی همزمان/ناهمگام، RTL، ماسک، Debounce، یکپارچگی با فرم
 * ==================================================
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid
 * @property {string[]} errors
 */

/**
 * @typedef {Object} ValidatorConfig
 * @property {string} type - نوع اعتبارسنج (required, minLength, email, ...)
 * @property {*} params - پارامترهای مورد نیاز
 * @property {string} message - پیام خطای اختصاصی
 */

/**
 * کلاس اصلی کامپوننت ورودی فرم
 */
class FormInput {
  // ==================== ثابت‌های کلاس ====================
  
  static VALIDATOR_TYPES = {
    REQUIRED: 'required',
    MIN_LENGTH: 'minLength',
    MAX_LENGTH: 'maxLength',
    EMAIL: 'email',
    PATTERN: 'pattern',
    MATCHES: 'matches',
    CUSTOM: 'custom',
    ASYNC: 'async'
  };

  static INPUT_TYPES = {
    TEXT: 'text',
    EMAIL: 'email',
    PASSWORD: 'password',
    NUMBER: 'number',
    TEL: 'tel',
    URL: 'url',
    SEARCH: 'search',
    DATE: 'date',
    TIME: 'time',
    TEXTAREA: 'textarea',
    SELECT: 'select'
  };

  // ==================== سازنده ====================

  /**
   * @param {Object} config - تنظیمات کامپوننت
   * @param {string} config.name - نام فیلد (الزامی)
   * @param {string} [config.type='text'] - نوع input
   * @param {string} [config.label=''] - برچسب فیلد
   * @param {string} [config.placeholder=''] - placeholder
   * @param {*} [config.initial_value=''] - مقدار اولیه
   * @param {Array<ValidatorConfig|Function>} [config.validators=[]] - اعتبارسنج‌ها
   * @param {Function} [config.on_change=null] - callback تغییر
   * @param {Function} [config.on_blur=null] - callback از دست دادن فوکوس
   * @param {Function} [config.on_focus=null] - callback دریافت فوکوس
   * @param {boolean} [config.required=false] - الزامی بودن (مخفف)
   * @param {boolean} [config.disabled=false] - غیرفعال بودن
   * @param {boolean} [config.readonly=false] - فقط خواندنی
   * @param {boolean} [config.rtl=false] - راست‌چین (برای فارسی)
   * @param {string} [config.mask=''] - الگوی ماسک (مثلا "***-***-****")
   * @param {number} [config.debounce_ms=300] - تأخیر اعتبارسنجی (میلی‌ثانیه)
   * @param {boolean} [config.show_validation_icons=true] - نمایش آیکون اعتبار
   * @param {string} [config.class_name=''] - کلاس CSS اضافی
   * @param {Object} [config.autocomplete_options=null] - تنظیمات اتوکامپلیت
   * @param {Form} [config.parent_form=null] - فرم والد (برای یکپارچگی)
   */
  constructor(config) {
    this._validate_config(config);
    
    this._id = this._generate_id();
    this._name = config.name;
    this._type = config.type || FormInput.INPUT_TYPES.TEXT;
    this._label = config.label || '';
    this._placeholder = config.placeholder || '';
    this._value = config.initial_value !== undefined ? config.initial_value : '';
    this._original_value = this._value;
    this._validators = this._normalize_validators(config.validators || []);
    this._on_change = config.on_change || null;
    this._on_blur = config.on_blur || null;
    this._on_focus = config.on_focus || null;
    this._required = config.required || false;
    this._disabled = config.disabled || false;
    this._readonly = config.readonly || false;
    this._rtl = config.rtl || false;
    this._mask = config.mask || '';
    this._debounce_ms = config.debounce_ms || 300;
    this._show_validation_icons = config.show_validation_icons !== false;
    this._class_name = config.class_name || '';
    this._autocomplete_options = config.autocomplete_options || null;
    this._parent_form = config.parent_form || null;
    
    this._errors = [];
    this._is_valid = true;
    this._is_validating = false;
    this._touched = false;
    this._dirty = false;
    this._focused = false;
    
    this._debounce_timer = null;
    this._async_validation_controller = null;
    
    this._element = null;
    this._input_element = null;
    this._label_element = null;
    this._error_element = null;
    this._icon_element = null;
    
    this._init();
  }

  // ==================== متدهای خصوصی ====================

  /**
   * اعتبارسنجی پیکربندی ورودی
   * @private
   */
  _validate_config(config) {
    if (!config.name) {
      throw new Error('FormInput: فیلد name الزامی است');
    }
  }

  /**
   * تولید شناسه یکتا برای کامپوننت
   * @private
   * @returns {string}
   */
  _generate_id() {
    return `form-input-${this._name}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * نرمال‌سازی اعتبارسنج‌ها به فرمت استاندارد
   * @private
   * @param {Array} validators
   * @returns {Array}
   */
  _normalize_validators(validators) {
    return validators.map(v => {
      if (typeof v === 'function') {
        return { type: FormInput.VALIDATOR_TYPES.CUSTOM, validator: v };
      }
      return v;
    });
  }

  /**
   * مقداردهی اولیه
   * @private
   */
  _init() {
    this._element = this._create_element();
    this._setup_event_listeners();
    
    if (this._required && !this._validators.some(v => v.type === FormInput.VALIDATOR_TYPES.REQUIRED)) {
      this._validators.unshift({
        type: FormInput.VALIDATOR_TYPES.REQUIRED,
        message: 'این فیلد الزامی است'
      });
    }
  }

  /**
   * ایجاد ساختار DOM
   * @private
   * @returns {HTMLElement}
   */
  _create_element() {
    const container = document.createElement('div');
    container.className = `form-input-container ${this._class_name}`;
    container.dataset.inputId = this._id;
    container.setAttribute('dir', this._rtl ? 'rtl' : 'ltr');

    // برچسب
    if (this._label) {
      this._label_element = document.createElement('label');
      this._label_element.htmlFor = this._id;
      this._label_element.className = 'form-input-label';
      this._label_element.textContent = this._label;
      if (this._required) {
        const required_span = document.createElement('span');
        required_span.className = 'form-input-required';
        required_span.textContent = ' *';
        required_span.setAttribute('aria-hidden', 'true');
        this._label_element.appendChild(required_span);
      }
      container.appendChild(this._label_element);
    }

    // wrapper برای input و آیکون
    const input_wrapper = document.createElement('div');
    input_wrapper.className = 'form-input-wrapper';

    // المان ورودی اصلی
    this._input_element = this._create_input_element();
    input_wrapper.appendChild(this._input_element);

    // آیکون اعتبارسنجی
    if (this._show_validation_icons) {
      this._icon_element = document.createElement('span');
      this._icon_element.className = 'form-input-icon';
      this._icon_element.setAttribute('aria-hidden', 'true');
      input_wrapper.appendChild(this._icon_element);
    }

    container.appendChild(input_wrapper);

    // المان خطا
    this._error_element = document.createElement('div');
    this._error_element.className = 'form-input-error';
    this._error_element.id = `${this._id}-error`;
    this._error_element.setAttribute('role', 'alert');
    container.appendChild(this._error_element);

    return container;
  }

  /**
   * ایجاد المان ورودی متناسب با نوع
   * @private
   * @returns {HTMLElement}
   */
  _create_input_element() {
    let input;
    
    if (this._type === FormInput.INPUT_TYPES.TEXTAREA) {
      input = document.createElement('textarea');
    } else if (this._type === FormInput.INPUT_TYPES.SELECT) {
      input = document.createElement('select');
      // TODO: اضافه کردن آپشن‌ها
    } else {
      input = document.createElement('input');
      input.type = this._type;
    }

    input.id = this._id;
    input.name = this._name;
    input.placeholder = this._placeholder;
    input.value = this._value;
    input.disabled = this._disabled;
    input.readOnly = this._readonly;
    input.setAttribute('aria-describedby', `${this._id}-error`);
    input.setAttribute('aria-invalid', 'false');

    if (this._autocomplete_options) {
      input.setAttribute('autocomplete', 'on');
      input.setAttribute('list', `${this._id}-datalist`);
      
      const datalist = document.createElement('datalist');
      datalist.id = `${this._id}-datalist`;
      this._autocomplete_options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        datalist.appendChild(option);
      });
      this._element.appendChild(datalist);
    }

    return input;
  }

  /**
   * تنظیم رویدادهای المان
   * @private
   */
  _setup_event_listeners() {
    this._input_element.addEventListener('input', (e) => this._handle_input(e));
    this._input_element.addEventListener('blur', (e) => this._handle_blur(e));
    this._input_element.addEventListener('focus', (e) => this._handle_focus(e));
  }

  /**
   * مدیریت رویداد input با debounce
   * @private
   */
  _handle_input(e) {
    const new_value = e.target.value;
    const masked_value = this._apply_mask(new_value);
    
    if (masked_value !== new_value) {
      this._input_element.value = masked_value;
      this._value = masked_value;
    } else {
      this._value = new_value;
    }

    this._dirty = true;

    if (this._debounce_timer) {
      clearTimeout(this._debounce_timer);
    }

    this._debounce_timer = setTimeout(() => {
      this._validate_all();
      if (this._on_change) {
        this._on_change({
          value: this._value,
          isValid: this._is_valid,
          errors: this._errors,
          touched: this._touched,
          dirty: this._dirty
        });
      }
      if (this._parent_form) {
        this._parent_form.notify_input_change(this);
      }
    }, this._debounce_ms);
  }

  /**
   * مدیریت رویداد blur
   * @private
   */
  _handle_blur(e) {
    this._touched = true;
    this._focused = false;
    this._validate_all();
    
    this._input_element.setAttribute('aria-invalid', (!this._is_valid).toString());
    
    if (this._on_blur) {
      this._on_blur({
        value: this._value,
        isValid: this._is_valid,
        errors: this._errors
      });
    }
    
    if (this._parent_form) {
      this._parent_form.notify_input_blur(this);
    }
  }

  /**
   * مدیریت رویداد focus
   * @private
   */
  _handle_focus(e) {
    this._focused = true;
    if (this._on_focus) {
      this._on_focus(this._value);
    }
  }

  /**
   * اعمال ماسک روی مقدار
   * @private
   * @param {string} value
   * @returns {string}
   */
  _apply_mask(value) {
    if (!this._mask) return value;
    
    // پیاده‌سازی ساده ماسک
    let masked = '';
    let value_index = 0;
    
    for (let i = 0; i < this._mask.length && value_index < value.length; i++) {
      if (this._mask[i] === '*') {
        masked += value[value_index];
        value_index++;
      } else {
        masked += this._mask[i];
        if (value[value_index] === this._mask[i]) {
          value_index++;
        }
      }
    }
    
    return masked;
  }

  /**
   * اجرای همه اعتبارسنج‌ها
   * @private
   */
  async _validate_all() {
    // لغو اعتبارسنجی ناهمگام قبلی
    if (this._async_validation_controller) {
      this._async_validation_controller.abort();
    }

    this._errors = [];
    this._is_validating = true;
    this._update_validation_ui();

    // اعتبارسنجی همزمان
    for (const validator of this._validators) {
      if (validator.type !== FormInput.VALIDATOR_TYPES.ASYNC) {
        const result = await this._execute_validator(validator);
        if (!result.isValid) {
          this._errors.push(...result.errors);
        }
      }
    }

    // اعتبارسنجی ناهمگام
    const async_validators = this._validators.filter(v => v.type === FormInput.VALIDATOR_TYPES.ASYNC);
    if (async_validators.length > 0) {
      this._async_validation_controller = new AbortController();
      
      try {
        for (const validator of async_validators) {
          if (this._async_validation_controller.signal.aborted) break;
          
          const result = await this._execute_validator(validator);
          if (!result.isValid) {
            this._errors.push(...result.errors);
          }
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('خطا در اعتبارسنجی ناهمگام:', error);
        }
      }
    }

    this._is_valid = this._errors.length === 0;
    this._is_validating = false;
    this._update_validation_ui();
  }

  /**
   * اجرای یک اعتبارسنج
   * @private
   * @param {Object} validator
   * @returns {Promise<ValidationResult>}
   */
  async _execute_validator(validator) {
    const result = { isValid: true, errors: [] };

    try {
      let validation_result;

      switch (validator.type) {
        case FormInput.VALIDATOR_TYPES.REQUIRED:
          validation_result = this._validate_required(validator);
          break;
        case FormInput.VALIDATOR_TYPES.MIN_LENGTH:
          validation_result = this._validate_min_length(validator);
          break;
        case FormInput.VALIDATOR_TYPES.MAX_LENGTH:
          validation_result = this._validate_max_length(validator);
          break;
        case FormInput.VALIDATOR_TYPES.EMAIL:
          validation_result = this._validate_email(validator);
          break;
        case FormInput.VALIDATOR_TYPES.PATTERN:
          validation_result = this._validate_pattern(validator);
          break;
        case FormInput.VALIDATOR_TYPES.MATCHES:
          validation_result = this._validate_matches(validator);
          break;
        case FormInput.VALIDATOR_TYPES.CUSTOM:
          validation_result = validator.validator(this._value, this);
          break;
        case FormInput.VALIDATOR_TYPES.ASYNC:
          validation_result = await validator.validator(this._value, this, this._async_validation_controller.signal);
          break;
        default:
          return result;
      }

      if (validation_result !== true) {
        result.isValid = false;
        result.errors.push(validation_result || validator.message || 'مقدار نامعتبر است');
      }
    } catch (error) {
      result.isValid = false;
      result.errors.push('خطا در اعتبارسنجی');
      console.error('Validator error:', error);
    }

    return result;
  }

  /**
   * اعتبارسنجی required
   * @private
   */
  _validate_required(validator) {
    const value = this._value !== null && this._value !== undefined ? this._value.toString().trim() : '';
    return value !== '' ? true : (validator.message || 'این فیلد الزامی است');
  }

  /**
   * اعتبارسنجی minLength
   * @private
   */
  _validate_min_length(validator) {
    const min = validator.params || 0;
    const value = this._value ? this._value.toString() : '';
    return value.length >= min ? true : (validator.message || `حداقل ${min} کاراکتر وارد کنید`);
  }

  /**
   * اعتبارسنجی maxLength
   * @private
   */
  _validate_max_length(validator) {
    const max = validator.params || Infinity;
    const value = this._value ? this._value.toString() : '';
    return value.length <= max ? true : (validator.message || `حداکثر ${max} کاراکتر مجاز است`);
  }

  /**
   * اعتبارسنجی ایمیل
   * @private
   */
  _validate_email(validator) {
    const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return email_regex.test(this._value) ? true : (validator.message || 'ایمیل نامعتبر است');
  }

  /**
   * اعتبارسنجی pattern
   * @private
   */
  _validate_pattern(validator) {
    const regex = validator.params instanceof RegExp ? validator.params : new RegExp(validator.params);
    return regex.test(this._value) ? true : (validator.message || 'فرمت نامعتبر است');
  }

  /**
   * اعتبارسنجی matches (تطابق با فیلد دیگر)
   * @private
   */
  _validate_matches(validator) {
    const compare_value = validator.params();
    return this._value === compare_value ? true : (validator.message || 'مقادیر مطابقت ندارند');
  }

  /**
   * به‌روزرسانی رابط کاربری بر اساس وضعیت اعتبارسنجی
   * @private
   */
  _update_validation_ui() {
    if (!this._error_element) return;

    // نمایش خطاها
    if (this._errors.length > 0 && (this._touched || this._dirty)) {
      this._error_element.textContent = this._errors[0];
      this._input_element.setAttribute('aria-invalid', 'true');
      this._element.classList.add('has-error');
      this._element.classList.remove('has-success');
      
      if (this._icon_element) {
        this._icon_element.textContent = '⚠️';
        this._icon_element.className = 'form-input-icon error';
      }
    } else if (this._is_valid && this._dirty && !this._is_validating) {
      this._error_element.textContent = '';
      this._input_element.setAttribute('aria-invalid', 'false');
      this._element.classList.remove('has-error');
      this._element.classList.add('has-success');
      
      if (this._icon_element) {
        this._icon_element.textContent = '✓';
        this._icon_element.className = 'form-input-icon success';
      }
    } else {
      this._error_element.textContent = '';
      this._input_element.setAttribute('aria-invalid', 'false');
      this._element.classList.remove('has-error', 'has-success');
      
      if (this._icon_element) {
        this._icon_element.textContent = '';
      }
    }

    if (this._is_validating) {
      this._element.classList.add('validating');
      if (this._icon_element) {
        this._icon_element.textContent = '⏳';
        this._icon_element.className = 'form-input-icon validating';
      }
    } else {
      this._element.classList.remove('validating');
    }
  }

  // ==================== متدهای عمومی ====================

  /**
   * دریافت مقدار فعلی
   * @returns {*}
   */
  get_value() {
    return this._value;
  }

  /**
   * تنظیم مقدار جدید
   * @param {*} new_value
   * @param {boolean} [skip_validation=false]
   */
  set_value(new_value, skip_validation = false) {
    this._value = new_value;
    this._input_element.value = new_value;
    this._dirty = true;
    
    if (!skip_validation) {
      this._validate_all();
    }
    
    if (this._on_change) {
      this._on_change({
        value: this._value,
        isValid: this._is_valid,
        errors: this._errors,
        touched: this._touched,
        dirty: this._dirty
      });
    }
  }

  /**
   * پاک کردن مقدار
   */
  reset() {
    this.set_value(this._original_value);
    this._touched = false;
    this._dirty = false;
    this._errors = [];
    this._is_valid = true;
    this._update_validation_ui();
  }

  /**
   * فعال/غیرفعال کردن
   * @param {boolean} disabled
   */
  set_disabled(disabled) {
    this._disabled = disabled;
    this._input_element.disabled = disabled;
  }

  /**
   * بررسی اعتبار فعلی
   * @returns {Promise<boolean>}
   */
  async is_valid() {
    await this._validate_all();
    return this._is_valid;
  }

  /**
   * دریافت خطاها
   * @returns {string[]}
   */
  get_errors() {
    return [...this._errors];
  }

  /**
   * دریافت وضعیت‌ها
   * @returns {Object}
   */
  get_state() {
    return {
      value: this._value,
      isValid: this._is_valid,
      errors: this._errors,
      touched: this._touched,
      dirty: this._dirty,
      focused: this._focused,
      disabled: this._disabled
    };
  }

  /**
   * فوکوس روی المان
   */
  focus() {
    this._input_element.focus();
  }

  /**
   * دریافت عنصر DOM
   * @returns {HTMLElement}
   */
  render() {
    return this._element;
  }

  /**
   * پاکسازی منابع
   */
  destroy() {
    if (this._debounce_timer) {
      clearTimeout(this._debounce_timer);
    }
    if (this._async_validation_controller) {
      this._async_validation_controller.abort();
    }
    // حذف event listeners
    this._input_element.removeEventListener('input', this._handle_input);
    this._input_element.removeEventListener('blur', this._handle_blur);
    this._input_element.removeEventListener('focus', this._handle_focus);
  }
}

// ==================== اعتبارسنج‌های پیشرفته ====================

/**
 * کارخانه‌های تولید اعتبارسنج
 */
FormInput.ValidatorFactory = {
  required: (message = 'این فیلد الزامی است') => ({
    type: FormInput.VALIDATOR_TYPES.REQUIRED,
    message
  }),

  minLength: (min, message) => ({
    type: FormInput.VALIDATOR_TYPES.MIN_LENGTH,
    params: min,
    message: message || `حداقل ${min} کاراکتر وارد کنید`
  }),

  maxLength: (max, message) => ({
    type: FormInput.VALIDATOR_TYPES.MAX_LENGTH,
    params: max,
    message: message || `حداکثر ${max} کاراکتر مجاز است`
  }),

  email: (message = 'ایمیل نامعتبر است') => ({
    type: FormInput.VALIDATOR_TYPES.EMAIL,
    message
  }),

  pattern: (regex, message) => ({
    type: FormInput.VALIDATOR_TYPES.PATTERN,
    params: regex,
    message: message || 'فرمت نامعتبر است'
  }),

  matches: (getCompareValue, message) => ({
    type: FormInput.VALIDATOR_TYPES.MATCHES,
    params: getCompareValue,
    message: message || 'مقادیر مطابقت ندارند'
  }),

  custom: (validatorFn) => ({
    type: FormInput.VALIDATOR_TYPES.CUSTOM,
    validator: validatorFn
  }),

  async: (asyncValidatorFn) => ({
    type: FormInput.VALIDATOR_TYPES.ASYNC,
    validator: asyncValidatorFn
  })
};

export default FormInput;
```
