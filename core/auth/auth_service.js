/**
 * ============================================================================
 * Auth Service - نهایی
 * ============================================================================
 * مدیریت احراز هویت و session کاربران
 * رعایت SOLID, KISS, DRY, snake_case
 */

const REFRESH_TOKEN_DAYS = 30;

class AuthService {
    constructor(options = {}) {
        this.auth_repository = options.auth_repository;
        this.token_manager = options.token_manager || new JWTTokenManager();
        this.validator = options.validator || new AuthValidatorImpl();
        this.state_manager = options.state_manager;
        this.password_hasher = options.password_hasher || new PasswordHasherImpl();
        this.rate_limiter = options.rate_limiter || new RateLimiter();
        this.event_emitter = options.event_emitter || new AuthEventEmitter();
        this.refresh_token_manager = options.refresh_token_manager ||
            new RefreshTokenManager(this.auth_repository, this.token_manager);

        if (!this.auth_repository || !this.state_manager) {
            throw new Error('auth_repository و state_manager الزامی هستند');
        }

        this.current_user = null;
        this.current_tokens = null;
        this.is_initialized = false;
        this._pending_register = null; // برای idempotency
    }

    /** مقداردهی اولیه */
    async init() {
        if (this.is_initialized) return;
        try {
            const saved_auth = await this._load_auth_state();
            if (saved_auth) {
                const valid = await this.check_auth();
                if (valid) this.event_emitter.emit(AUTH_EVENTS.RESTORED, { user: this.current_user });
            }
            this.is_initialized = true;
        } catch (error) {
            console.error('خطا در init:', error);
        }
    }

    /** ثبت‌نام با Idempotency */
    async register(register_data) {
        if (this._pending_register) return this._pending_register;
        this._pending_register = this._register_impl(register_data);
        return this._pending_register;
    }

    /** پیاده‌سازی داخلی ثبت‌نام */
    async _register_impl(register_data) {
        const dto = register_data instanceof RegisterRequestDTO ? register_data : new RegisterRequestDTO(register_data);
        const validation = dto.validate();
        if (!validation.is_valid) throw new ValidationError(validation.errors);

        const adv_validation = this.validator.validate_register_data(dto);
        if (!adv_validation.is_valid) throw new ValidationError(adv_validation.errors);

        const existing = await this.auth_repository.find_user_by_email(dto.email);
        if (existing) throw new ValidationError(['این ایمیل قبلاً ثبت شده است']);

        const salt = this.password_hasher.generate_salt();
        const password_hash = await this.password_hasher.hash(dto.password + salt);

        const user_model = dto.to_user_model(password_hash, salt);
        const created_user = await this.auth_repository.create_user(user_model);
        if (!created_user?.id) throw new AuthError('خطا در ایجاد حساب کاربری', 'CREATION_FAILED');

        const tokens = await this._generate_tokens(created_user);
        const session = await this._create_session(created_user.id, tokens.access_token, false, tokens.refresh_token);

        await this._update_auth_state(created_user, tokens, 'register');

        this.event_emitter.emit(AUTH_EVENTS.REGISTERED, { user_id: created_user.id, email: created_user.email });

        return new AuthResponseDTO(created_user, tokens, session);
    }

    /** تولید access و refresh token */
    async _generate_tokens(user) {
        const access_token = this.token_manager.generate_token(
            { user_id: user.id, email: user.email, role: user.role || 'user', type: 'access' },
            'access'
        );
        const refresh_data = await this.refresh_token_manager.generate_refresh_token(user.id, user);
        return new TokenResponseDTO(access_token, refresh_data.token, 604800);
    }

    /** ورود کاربر */
    async login(login_data) {
        const dto = login_data instanceof LoginRequestDTO ? login_data : new LoginRequestDTO(login_data);
        const validation = dto.validate();
        if (!validation.is_valid) throw new ValidationError(validation.errors);

        this.rate_limiter.check(dto.email);

        const user = await this.auth_repository.find_user_by_email(dto.email);
        if (!user) throw new ValidationError(['ایمیل یا رمز عبور اشتباه است']);

        const is_valid = await this.password_hasher.verify(dto.password, user.password_hash);
        if (!is_valid) {
            const remaining = this.rate_limiter.get_remaining_attempts(dto.email);
            throw new ValidationError([`ایمیل یا رمز عبور اشتباه است. ${remaining} تلاش باقی‌مانده.`]);
        }

        this.rate_limiter.reset(dto.email);

        if (dto.remember_me) await this._revoke_previous_sessions(user.id);

        const tokens = await this._generate_tokens(user);
        const session = await this._create_session(user.id, tokens.access_token, dto.remember_me, tokens.refresh_token, dto.device_info);

        await this.auth_repository.update_user(user.id, { last_active: new Date().toISOString(), login_count: (user.login_count || 0) + 1 });
        await this._update_auth_state(user, tokens, 'login');

        this.event_emitter.emit(AUTH_EVENTS.LOGGED_IN, { user_id: user.id, remember_me: dto.remember_me });

        return new AuthResponseDTO(user, tokens, session);
    }

    /** تمدید توکن‌ها */
    async refresh_tokens() {
        console.debug('Refreshing tokens...');
        const refresh_token = this.state_manager.getState()?.auth.tokens?.refresh_token;
        if (!refresh_token) throw new AuthError('Refresh token یافت نشد', 'NO_REFRESH_TOKEN');

        try {
            const new_tokens = await this.refresh_token_manager.refresh_access_token(refresh_token);
            await this.state_manager.dispatch('TOKEN_REFRESHED', new_tokens);
            this.current_tokens = new_tokens;
            this.event_emitter.emit(AUTH_EVENTS.TOKEN_REFRESHED);
            return new_tokens;
        } catch {
            await this.logout();
            throw new AuthError('نشست منقضی شده است. لطفاً دوباره وارد شوید.', 'SESSION_EXPIRED');
        }
    }

    /** خروج کاربر */
    async logout() {
        if (!this.current_user) return;
        await this._revoke_previous_sessions(this.current_user.id);
        this.current_user = null;
        this.current_tokens = null;
        await this.state_manager.dispatch('LOGGED_OUT', {});
        this.event_emitter.emit(AUTH_EVENTS.LOGGED_OUT);
    }

    /** بررسی وضعیت احراز هویت */
    async check_auth() {
        const state = this.state_manager.getState();
        if (!state?.auth?.user || !state.auth.tokens?.access_token) return false;

        const access_token = state.auth.tokens.access_token;
        const verified = this.token_manager.verify_token(access_token);
        if (!verified.is_valid) return false;

        this.current_user = state.auth.user;
        this.current_tokens = state.auth.tokens;
        return true;
    }

    /** بازگرداندن کاربر فعلی */
    get_current_user() {
        return this.current_user;
    }

    /** به‌روزرسانی پروفایل کاربر */
    async update_profile(update_data) {
        if (!this.current_user) throw new AuthError('کاربر لاگین نشده است');
        const updated_user = await this.auth_repository.update_user(this.current_user.id, update_data);
        this.current_user = updated_user;
        await this._update_auth_state(updated_user, this.current_tokens, 'update_profile');
        this.event_emitter.emit(AUTH_EVENTS.PROFILE_UPDATED, { user_id: updated_user.id });
        return updated_user;
    }

    /** تغییر رمز عبور */
    async change_password(old_password, new_password) {
        if (!this.current_user) throw new AuthError('کاربر لاگین نشده است');
        const is_valid = await this.password_hasher.verify(old_password, this.current_user.password_hash);
        if (!is_valid) throw new ValidationError(['رمز عبور فعلی اشتباه است']);

        const salt = this.password_hasher.generate_salt();
        const new_hash = await this.password_hasher.hash(new_password + salt);
        await this.auth_repository.update_user(this.current_user.id, { password_hash: new_hash, salt });
        this.event_emitter.emit(AUTH_EVENTS.PASSWORD_CHANGED, { user_id: this.current_user.id });
    }

    /** =================== Private Methods =================== */

    async _create_session(user_id, access_token, remember_me, refresh_token, device_info = {}) {
        const session_data = {
            user_id,
            access_token,
            refresh_token,
            remember_me,
            device_info,
            created_at: new Date().toISOString()
        };
        await this.auth_repository.save_session(session_data);
        return session_data;
    }

    async _update_auth_state(user, tokens, action) {
        this.current_user = user;
        this.current_tokens = tokens;
        await this.state_manager.dispatch('AUTH_STATE_UPDATED', { user, tokens, action });
    }

    async _revoke_previous_sessions(user_id) {
        const sessions = await this.auth_repository.find_sessions_by_user(user_id);
        for (const s of sessions) {
            await this.refresh_token_manager.revoke_refresh_token(s.refresh_token);
        }
        await this.auth_repository.delete_sessions_by_user(user_id);
    }

    async _load_auth_state() {
        const state = this.state_manager.getState();
        return state?.auth || null;
    }
}

export { AuthService };
