
// core/auth/auth-service.js
/**
 * Auth Service - مدیریت احراز هویت کاربران
 * مسئولیت: ثبت‌نام، ورود، خروج و مدیریت جلسه کاربر با الگوی Repository
 * اصل SRP: فقط عملیات احراز هویت
 * اصل DIP: وابستگی به Repository Interface نه پیاده‌سازی
 * اصل ISP: اینترفیس‌های مجزا برای عملیات مختلف
 * اصل LSP: کلاس‌های پیاده‌سازی قابل جایگزینی با اینترفیس
 * اصل OCP: قابلیت توسعه بدون تغییر هسته
 */

// ============ Interfaces ============
class IAuthRepository {
    async createUser(userData) {}
    async findUserByEmail(email) {}
    async findUserById(userId) {}
    async updateUser(userId, updateData) {}
    async saveSession(sessionData) {}
    async getSession(userId) {}
    async deleteSession(userId) {}
    async saveRefreshToken(tokenData) {}
    async findRefreshToken(token) {}
    async deleteRefreshToken(token) {}
}

class IAuthValidator {
    validateEmail(email) {}
    validatePassword(password) {}
    validateUsername(username) {}
    validatePhone(phone) {}
}

class ITokenManager {
    generateToken(payload) {}
    verifyToken(token) {}
    decodeToken(token) {}
    isTokenExpired(token) {}
}

class IPasswordHasher {
    async hash(password) {}
    async verify(password, hash) {}
}

// ============ Event Emitter ============
class AuthEventEmitter {
    constructor() {
        this.events = new Map();
    }

    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(callback);
        return this;
    }

    off(event, callback) {
        if (this.events.has(event)) {
            const callbacks = this.events.get(event).filter(cb => cb !== callback);
            this.events.set(event, callbacks);
        }
        return this;
    }

    emit(event, data) {
        if (this.events.has(event)) {
            this.events.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`خطا در اجرای رویداد ${event}:`, error);
                }
            });
        }
    }

    once(event, callback) {
        const onceWrapper = (data) => {
            this.off(event, onceWrapper);
            callback(data);
        };
        this.on(event, onceWrapper);
    }

    clear(event) {
        if (event) {
            this.events.delete(event);
        } else {
            this.events.clear();
        }
    }
}

// ============ Rate Limiter ============
class RateLimiter {
    constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
        this.maxAttempts = maxAttempts;
        this.windowMs = windowMs;
        this.attempts = new Map();
        this.blocked = new Map();
    }

    check(key) {
        // بررسی بلاک بودن
        if (this.blocked.has(key)) {
            const blockedUntil = this.blocked.get(key);
            if (Date.now() < blockedUntil) {
                const remainingSeconds = Math.ceil((blockedUntil - Date.now()) / 1000);
                throw new Error(`حساب کاربری موقتاً مسدود است. ${remainingSeconds} ثانیه دیگر تلاش کنید.`);
            } else {
                this.blocked.delete(key);
            }
        }

        const now = Date.now();
        const userAttempts = this.attempts.get(key) || [];
        
        // پاک کردن تلاش‌های قدیمی
        const validAttempts = userAttempts.filter(t => now - t < this.windowMs);
        
        if (validAttempts.length >= this.maxAttempts) {
            // بلاک کردن کاربر به مدت 30 دقیقه
            const blockUntil = now + (30 * 60 * 1000);
            this.blocked.set(key, blockUntil);
            this.attempts.delete(key);
            
            throw new Error('تعداد تلاش‌های مجاز بیش از حد است. حساب کاربری به مدت ۳۰ دقیقه مسدود شد.');
        }
        
        validAttempts.push(now);
        this.attempts.set(key, validAttempts);
        return true;
    }

    reset(key) {
        this.attempts.delete(key);
        this.blocked.delete(key);
    }

    getRemainingAttempts(key) {
        const userAttempts = this.attempts.get(key) || [];
        const now = Date.now();
        const validAttempts = userAttempts.filter(t => now - t < this.windowMs);
        return Math.max(0, this.maxAttempts - validAttempts.length);
    }
}

// ============ Password Hasher ============
class PasswordHasherImpl {
    async hash(password) {
        // شبیه‌سازی هش با SHA-256 (در پروژه واقعی از bcrypt استفاده شود)
        const encoder = new TextEncoder();
        const data = encoder.encode(password + 'farsinglish-salt-' + Date.now());
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async verify(password, hash) {
        // در پروژه واقعی، این متد باید با هش ذخیره‌شده مقایسه کند
        // اینجا یک شبیه‌سازی ساده برای تست
        return password === 'correct-password'; // TODO: پیاده‌سازی واقعی
    }

    generateSalt() {
        return Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
}

// ============ DTOs (Data Transfer Objects) ============
class RegisterRequestDTO {
    constructor(data) {
        this.email = data.email?.trim().toLowerCase() || '';
        this.password = data.password || '';
        this.username = data.username?.trim() || '';
        this.phone = data.phone?.trim() || '';
        this.language = data.language || 'fa';
        this.avatar_url = data.avatar_url || '';
    }

    toUserModel(passwordHash, salt) {
        return {
            email: this.email,
            password_hash: passwordHash,
            salt: salt,
            username: this.username,
            phone: this.phone,
            language: this.language,
            avatar_url: this.avatar_url,
            level: 1,
            xp: 0,
            streak_days: 0,
            last_active: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_verified: false,
            role: 'user'
        };
    }

    validate() {
        const errors = [];
        if (!this.email) errors.push('ایمیل الزامی است');
        if (!this.password) errors.push('رمز عبور الزامی است');
        if (!this.username) errors.push('نام کاربری الزامی است');
        if (this.password && this.password.length < 6) errors.push('رمز عبور باید حداقل ۶ کاراکتر باشد');
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

class LoginRequestDTO {
    constructor(data) {
        this.email = data.email?.trim().toLowerCase() || '';
        this.password = data.password || '';
        this.rememberMe = data.rememberMe || false;
        this.deviceInfo = data.deviceInfo || navigator.userAgent;
    }

    validate() {
        const errors = [];
        if (!this.email) errors.push('ایمیل الزامی است');
        if (!this.password) errors.push('رمز عبور الزامی است');
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

class RefreshTokenRequestDTO {
    constructor(data) {
        this.refreshToken = data.refreshToken || '';
        this.userId = data.userId || null;
    }

    validate() {
        if (!this.refreshToken && !this.userId) {
            return { isValid: false, errors: ['Refresh token یا userId الزامی است'] };
        }
        return { isValid: true, errors: [] };
    }
}

class UserResponseDTO {
    constructor(user) {
        this.id = user.id;
        this.email = user.email;
        this.username = user.username;
        this.phone = user.phone;
        this.avatar_url = user.avatar_url;
        this.language = user.language;
        this.level = user.level;
        this.xp = user.xp;
        this.streak_days = user.streak_days;
        this.last_active = user.last_active;
        this.created_at = user.created_at;
        this.is_verified = user.is_verified || false;
        this.role = user.role || 'user';
    }

    static fromUserModel(user) {
        if (!user) return null;
        return new UserResponseDTO(user);
    }

    toJSON() {
        return {
            id: this.id,
            email: this.email,
            username: this.username,
            phone: this.phone,
            avatar_url: this.avatar_url,
            language: this.language,
            level: this.level,
            xp: this.xp,
            streak_days: this.streak_days,
            last_active: this.last_active,
            joined_at: this.created_at,
            is_verified: this.is_verified
        };
    }
}

class TokenResponseDTO {
    constructor(accessToken, refreshToken, expiresIn) {
        this.access_token = accessToken;
        this.refresh_token = refreshToken;
        this.token_type = 'Bearer';
        this.expires_in = expiresIn || 604800; // 7 روز بر حسب ثانیه
        this.created_at = Date.now();
    }

    isExpired() {
        return Date.now() > this.created_at + (this.expires_in * 1000);
    }
}

class AuthResponseDTO {
    constructor(user, tokens, session) {
        this.user = UserResponseDTO.fromUserModel(user);
        this.tokens = tokens;
        this.session_id = session?.id;
        this.session_expires_at = session?.expires_at;
        this.authenticated_at = new Date().toISOString();
    }

    toJSON() {
        return {
            user: this.user.toJSON(),
            tokens: this.tokens,
            session_id: this.session_id,
            authenticated_at: this.authenticated_at
        };
    }
}

// ============ Validators ============
class AuthValidatorImpl {
    validateEmail(email) {
        if (!email) {
            return { isValid: false, error: 'ایمیل الزامی است' };
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return { isValid: false, error: 'فرمت ایمیل نامعتبر است' };
        }
        
        return { isValid: true, error: null };
    }

    validatePassword(password) {
        if (!password) {
            return { isValid: false, error: 'رمز عبور الزامی است' };
        }
        
        if (password.length < 6) {
            return { isValid: false, error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' };
        }
        
        if (password.length > 72) {
            return { isValid: false, error: 'رمز عبور نباید بیش از ۷۲ کاراکتر باشد' };
        }
        
        // بررسی پیچیدگی رمز عبور
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
        
        let strength = 0;
        if (hasLowerCase) strength++;
        if (hasUpperCase) strength++;
        if (hasNumbers) strength++;
        if (hasSpecial) strength++;
        
        if (strength < 2) {
            return { 
                isValid: false, 
                error: 'رمز عبور باید شامل حداقل دو نوع از این موارد باشد: حروف بزرگ، حروف کوچک، اعداد، نمادها',
                strength
            };
        }
        
        return { 
            isValid: true, 
            error: null,
            strength
        };
    }

    validateUsername(username) {
        if (!username) {
            return { isValid: false, error: 'نام کاربری الزامی است' };
        }
        
        if (username.length < 3) {
            return { isValid: false, error: 'نام کاربری باید حداقل ۳ کاراکتر باشد' };
        }
        
        if (username.length > 50) {
            return { isValid: false, error: 'نام کاربری نباید بیش از ۵۰ کاراکتر باشد' };
        }
        
        const validChars = /^[a-zA-Z0-9_\-.\u0600-\u06FF]+$/;
        if (!validChars.test(username)) {
            return { 
                isValid: false, 
                error: 'نام کاربری فقط می‌تواند شامل حروف، اعداد و _- باشد' 
            };
        }
        
        return { isValid: true, error: null };
    }

    validatePhone(phone) {
        if (!phone) {
            return { isValid: true, error: null }; // اختیاری
        }
        
        const phoneRegex = /^09[0-9]{9}$/;
        if (!phoneRegex.test(phone)) {
            return { 
                isValid: false, 
                error: 'شماره موبایل باید با 09 شروع شود و 11 رقم باشد' 
            };
        }
        
        return { isValid: true, error: null };
    }

    validateRegisterData(data) {
        const errors = [];
        
        const emailValidation = this.validateEmail(data.email);
        if (!emailValidation.isValid) errors.push(emailValidation.error);
        
        const passwordValidation = this.validatePassword(data.password);
        if (!passwordValidation.isValid) errors.push(passwordValidation.error);
        
        const usernameValidation = this.validateUsername(data.username);
        if (!usernameValidation.isValid) errors.push(usernameValidation.error);
        
        const phoneValidation = this.validatePhone(data.phone);
        if (!phoneValidation.isValid) errors.push(phoneValidation.error);
        
        return {
            isValid: errors.length === 0,
            errors,
            validatedData: data,
            passwordStrength: passwordValidation.strength || 0
        };
    }
}

// ============ Token Manager ============
class JWTTokenManager {
    constructor(secret = 'farsinglish-secret-key', options = {}) {
        this.secret = secret;
        this.accessTokenExpiry = options.accessTokenExpiry || 7 * 24 * 60 * 60 * 1000; // 7 روز
        this.refreshTokenExpiry = options.refreshTokenExpiry || 30 * 24 * 60 * 60 * 1000; // 30 روز
        this.issuer = options.issuer || 'farsinglish';
        this.audience = options.audience || 'farsinglish-users';
    }

    generateToken(payload, type = 'access') {
        try {
            const header = {
                alg: 'HS256',
                typ: 'JWT',
                kid: this._generateKeyId()
            };
            
            const expiry = type === 'access' ? this.accessTokenExpiry : this.refreshTokenExpiry;
            
            const now = Math.floor(Date.now() / 1000);
            const payloadData = {
                ...payload,
                iss: this.issuer,
                aud: this.audience,
                iat: now,
                nbf: now,
                exp: now + Math.floor(expiry / 1000),
                jti: this._generateJTI(),
                type: type
            };
            
            const encodedHeader = this._base64UrlEncode(JSON.stringify(header));
            const encodedPayload = this._base64UrlEncode(JSON.stringify(payloadData));
            const signature = this._createSignature(`${encodedHeader}.${encodedPayload}`);
            
            return `${encodedHeader}.${encodedPayload}.${signature}`;
        } catch (error) {
            console.error('خطا در تولید توکن:', error);
            throw new Error('خطا در تولید توکن');
        }
    }

    verifyToken(token) {
        try {
            if (!token || typeof token !== 'string') {
                return { isValid: false, error: 'توکن ارائه نشده است' };
            }

            const parts = token.split('.');
            if (parts.length !== 3) {
                return { isValid: false, error: 'فرمت توکن نامعتبر است' };
            }

            const [encodedHeader, encodedPayload, signature] = parts;
            
            // بررسی امضا
            const expectedSignature = this._createSignature(`${encodedHeader}.${encodedPayload}`);
            if (signature !== expectedSignature) {
                return { isValid: false, error: 'امضای توکن نامعتبر است' };
            }

            // دیکد و بررسی payload
            const payload = JSON.parse(this._base64UrlDecode(encodedPayload));
            
            // بررسی زمان
            const now = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp < now) {
                return { isValid: false, error: 'توکن منقضی شده است', payload };
            }
            
            if (payload.nbf && payload.nbf > now) {
                return { isValid: false, error: 'توکن هنوز فعال نشده است', payload };
            }

            // بررسی issuer و audience
            if (payload.iss && payload.iss !== this.issuer) {
                return { isValid: false, error: 'صادرکننده توکن نامعتبر است', payload };
            }

            return { 
                isValid: true, 
                payload,
                error: null
            };

        } catch (error) {
            return { 
                isValid: false, 
                error: 'توکن نامعتبر است: ' + error.message 
            };
        }
    }

    decodeToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return null;
            }
            
            const payload = JSON.parse(this._base64UrlDecode(parts[1]));
            return payload;
        } catch (error) {
            return null;
        }
    }

    isTokenExpired(token) {
        const decoded = this.decodeToken(token);
        if (!decoded || !decoded.exp) {
            return true;
        }
        
        return decoded.exp < Math.floor(Date.now() / 1000);
    }

    refreshToken(oldToken) {
        const verification = this.verifyToken(oldToken);
        if (!verification.isValid) {
            throw new Error('توکن نامعتبر است');
        }

        // اگر توکن از نوع refresh است
        if (verification.payload.type === 'refresh') {
            const { userId, email, role } = verification.payload;
            return this.generateToken({ userId, email, role }, 'access');
        }

        throw new Error('توکن معتبر برای تمدید نیست');
    }

    _generateKeyId() {
        return Math.random().toString(36).substring(2, 10);
    }

    _generateJTI() {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }

    _base64UrlEncode(str) {
        return btoa(str)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    _base64UrlDecode(str) {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) {
            str += '=';
        }
        return atob(str);
    }

    _createSignature(data) {
        // در پروژه واقعی از HMAC-SHA256 استفاده شود
        // اینجا یک شبیه‌سازی ساده
        const encoder = new TextEncoder();
        const keyData = encoder.encode(this.secret);
        const messageData = encoder.encode(data);
        
        // شبیه‌سازی امضا
        return this._base64UrlEncode(
            Array.from(messageData)
                .map((b, i) => b ^ (keyData[i % keyData.length] || 0))
                .reduce((acc, val) => acc + val.toString(16).padStart(2, '0'), '')
        );
    }
}

// ============ Refresh Token Manager ============
class RefreshTokenManager {
    constructor(authRepository, tokenManager) {
        this.authRepository = authRepository;
        this.tokenManager = tokenManager;
    }

    async generateRefreshToken(userId, userData = {}) {
        try {
            const refreshToken = this.tokenManager.generateToken(
                { 
                    userId, 
                    email: userData.email,
                    role: userData.role || 'user',
                    type: 'refresh' 
                },
                'refresh'
            );
            
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30); // 30 روز
            
            const tokenData = {
                user_id: userId,
                token: refreshToken,
                expires_at: expiresAt.toISOString(),
                created_at: new Date().toISOString(),
                revoked: false
            };
            
            await this.authRepository.saveRefreshToken(tokenData);
            
            return {
                token: refreshToken,
                expires_at: expiresAt.toISOString()
            };
        } catch (error) {
            console.error('خطا در تولید refresh token:', error);
            throw new Error('خطا در ایجاد توکن تمدید');
        }
    }

    async refreshAccessToken(refreshToken) {
        try {
            if (!refreshToken) {
                throw new Error('Refresh token الزامی است');
            }

            // بررسی اعتبار توکن
            const verification = this.tokenManager.verifyToken(refreshToken);
            if (!verification.isValid) {
                throw new Error('Refresh token نامعتبر است: ' + verification.error);
            }

            // بررسی نوع توکن
            if (verification.payload.type !== 'refresh') {
                throw new Error('توکن ارائه شده از نوع refresh نیست');
            }

            // بررسی وجود توکن در دیتابیس
            const tokenData = await this.authRepository.findRefreshToken(refreshToken);
            
            if (!tokenData) {
                throw new Error('Refresh token در سیستم یافت نشد');
            }

            if (tokenData.revoked) {
                throw new Error('Refresh token باطل شده است');
            }

            if (new Date(tokenData.expires_at) < new Date()) {
                throw new Error('Refresh token منقضی شده است');
            }

            // تولید access token جدید
            const accessToken = this.tokenManager.generateToken(
                {
                    userId: verification.payload.userId,
                    email: verification.payload.email,
                    role: verification.payload.role,
                    type: 'access'
                },
                'access'
            );

            return {
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: 604800 // 7 روز
            };

        } catch (error) {
            console.error('خطا در تمدید توکن:', error);
            throw error;
        }
    }

    async revokeRefreshToken(refreshToken) {
        try {
            await this.authRepository.deleteRefreshToken(refreshToken);
            return true;
        } catch (error) {
            console.error('خطا در باطل کردن refresh token:', error);
            return false;
        }
    }
}

// ============ Auth Service ============
class AuthService {
    constructor(options = {}) {
        // Dependency Injection
        this.authRepository = options.authRepository;
        this.tokenManager = options.tokenManager || new JWTTokenManager();
        this.validator = options.validator || new AuthValidatorImpl();
        this.stateManager = options.stateManager;
        this.passwordHasher = options.passwordHasher || new PasswordHasherImpl();
        this.rateLimiter = options.rateLimiter || new RateLimiter();
        this.eventEmitter = options.eventEmitter || new AuthEventEmitter();
        this.refreshTokenManager = options.refreshTokenManager || 
            new RefreshTokenManager(this.authRepository, this.tokenManager);

        if (!this.authRepository || !this.stateManager) {
            throw new Error('authRepository و stateManager اجباری هستند');
        }

        this.currentUser = null;
        this.currentTokens = null;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;
        
        try {
            // بازیابی وضعیت از localStorage یا IndexedDB
            const savedAuth = await this._loadAuthState();
            if (savedAuth) {
                const isValid = await this.checkAuth();
                if (isValid) {
                    this.eventEmitter.emit('auth:restored', { user: this.currentUser });
                }
            }
            this.isInitialized = true;
        } catch (error) {
            console.error('خطا در مقداردهی اولیه AuthService:', error);
        }
    }

    /**
     * ثبت‌نام کاربر جدید
     * @param {RegisterRequestDTO|Object} registerData - داده‌های ثبت‌نام
     * @returns {Promise<AuthResponseDTO>}
     */
    async register(registerData) {
        try {
            // تبدیل به DTO
            const dto = registerData instanceof RegisterRequestDTO 
                ? registerData 
                : new RegisterRequestDTO(registerData);

            // اعتبارسنجی
            const validation = dto.validate();
            if (!validation.isValid) {
                throw new Error(validation.errors.join(', '));
            }

            // اعتبارسنجی پیشرفته
            const advancedValidation = this.validator.validateRegisterData(dto);
            if (!advancedValidation.isValid) {
                throw new Error(advancedValidation.errors.join(', '));
            }

            // بررسی تکراری نبودن ایمیل
            const existingUser = await this.authRepository.findUserByEmail(dto.email);
            if (existingUser) {
                throw new Error('این ایمیل قبلاً ثبت شده است');
            }

            // هش کردن رمز عبور
            const salt = this.passwordHasher.generateSalt();
            const passwordHash = await this.passwordHasher.hash(dto.password + salt);

            // ایجاد کاربر
            const userModel = dto.toUserModel(passwordHash, salt);
            const createdUser = await this.authRepository.createUser(userModel);

            if (!createdUser || !createdUser.id) {
                throw new Error('خطا در ایجاد حساب کاربری');
            }

            // ایجاد توکن‌ها
            const tokenPayload = {
                userId: createdUser.id,
                email: createdUser.email,
                role: createdUser.role || 'user'
            };

            const accessToken = this.tokenManager.generateToken(tokenPayload, 'access');
            const refreshTokenData = await this.refreshTokenManager.generateRefreshToken(
                createdUser.id,
                createdUser
            );

            const tokens = new TokenResponseDTO(accessToken, refreshTokenData.token, 604800);

            // ایجاد جلسه
            const session = await this._createSession(
                createdUser.id, 
                accessToken, 
                false,
                refreshTokenData.token
            );

            // به‌روزرسانی state
            await this._updateAuthState(createdUser, tokens, 'register');

            // emit رویداد
            this.eventEmitter.emit('auth:registered', {
                userId: createdUser.id,
                email: createdUser.email
            });

            return new AuthResponseDTO(createdUser, tokens, session);

        } catch (error) {
            this.eventEmitter.emit('auth:error', { 
                operation: 'register', 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * ورود کاربر
     * @param {LoginRequestDTO|Object} loginData - داده‌های ورود
     * @returns {Promise<AuthResponseDTO>}
     */
    async login(loginData) {
        try {
            // تبدیل به DTO
            const dto = loginData instanceof LoginRequestDTO 
                ? loginData 
                : new LoginRequestDTO(loginData);

            // اعتبارسنجی
            const validation = dto.validate();
            if (!validation.isValid) {
                throw new Error(validation.errors.join(', '));
            }

            // بررسی محدودیت تلاش
            this.rateLimiter.check(dto.email);

            // یافتن کاربر
            const user = await this.authRepository.findUserByEmail(dto.email);
            if (!user) {
                throw new Error('ایمیل یا رمز عبور اشتباه است');
            }

            // بررسی رمز عبور
            const isPasswordValid = await this.passwordHasher.verify(dto.password, user.password_hash);
            if (!isPasswordValid) {
                // ثبت تلاش ناموفق
                const remainingAttempts = this.rateLimiter.getRemainingAttempts(dto.email);
                throw new Error(`ایمیل یا رمز عبور اشتباه است. ${remainingAttempts} تلاش باقی‌مانده.`);
            }

            // پاک کردن محدودیت پس از ورود موفق
            this.rateLimiter.reset(dto.email);

            // باطل کردن جلسات قبلی (اختیاری)
            if (dto.rememberMe) {
                await this._revokePreviousSessions(user.id);
            }

            // ایجاد توکن‌ها
            const tokenPayload = {
                userId: user.id,
                email: user.email,
                role: user.role || 'user'
            };

            const accessToken = this.tokenManager.generateToken(tokenPayload, 'access');
            const refreshTokenData = await this.refreshTokenManager.generateRefreshToken(
                user.id,
                user
            );

            const tokens = new TokenResponseDTO(accessToken, refreshTokenData.token, 604800);

            // ایجاد یا به‌روزرسانی جلسه
            const session = await this._createSession(
                user.id, 
                accessToken, 
                dto.rememberMe,
                refreshTokenData.token,
                dto.deviceInfo
            );

            // به‌روزرسانی آخرین فعالیت
            await this.authRepository.updateUser(user.id, {
                last_active: new Date().toISOString(),
                login_count: (user.login_count || 0) + 1
            });

            // به‌روزرسانی state
            await this._updateAuthState(user, tokens, 'login');

            // emit رویداد
            this.eventEmitter.emit('auth:loggedIn', { 
                userId: user.id,
                rememberMe: dto.rememberMe 
            });

            return new AuthResponseDTO(user, tokens, session);

        } catch (error) {
            this.eventEmitter.emit('auth:error', { 
                operation: 'login', 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * خروج کاربر
     * @param {boolean} everywhere - خروج از همه دستگاه‌ها
     * @returns {Promise<void>}
     */
    async logout(everywhere = false) {
        try {
            const currentState = this.stateManager.getState();
            const userId = currentState.auth.user?.id;
            const sessionId = currentState.auth.session_id;

            if (userId) {
                if (everywhere) {
                    // باطل کردن همه جلسات
                    await this._revokeAllSessions(userId);
                } else {
                    // حذف جلسه فعلی
                    await this.authRepository.deleteSession(userId, sessionId);
                }

                // باطل کردن refresh token فعلی
                if (this.currentTokens?.refresh_token) {
                    await this.refreshTokenManager.revokeRefreshToken(this.currentTokens.refresh_token);
                }

                // به‌روزرسانی آخرین فعالیت
                await this.authRepository.updateUser(userId, {
                    last_active: new Date().toISOString()
                });
            }

            // emit رویداد قبل از پاکسازی
            this.eventEmitter.emit('auth:loggingOut', { userId, everywhere });

            // پاک‌سازی state
            await this.stateManager.dispatch('USER_LOGOUT', { everywhere });
            
            // پاک‌سازی داده‌های محلی
            this.currentUser = null;
            this.currentTokens = null;

            // پاک‌سازی localStorage
            this._clearAuthStorage();

            this.eventEmitter.emit('auth:loggedOut', { userId, everywhere });

        } catch (error) {
            console.error('خطا در خروج:', error);
            this.eventEmitter.emit('auth:error', { 
                operation: 'logout', 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * تمدید توکن دسترسی
     * @returns {Promise<TokenResponseDTO>}
     */
    async refreshTokens() {
        try {
            const currentState = this.stateManager.getState();
            const refreshToken = currentState.auth.tokens?.refresh_token;

            if (!refreshToken) {
                throw new Error('Refresh token یافت نشد');
            }

            const newTokens = await this.refreshTokenManager.refreshAccessToken(refreshToken);

            // به‌روزرسانی state
            await this.stateManager.dispatch('TOKEN_REFRESHED', newTokens);
            
            this.currentTokens = newTokens;

            this.eventEmitter.emit('auth:tokensRefreshed');

            return newTokens;

        } catch (error) {
            // اگر تمدید ناموفق بود، کاربر را خارج کن
            await this.logout();
            throw new Error('نشست شما منقضی شده است. لطفاً مجدداً وارد شوید.');
        }
    }

    /**
     * بررسی وضعیت احراز هویت
     * @returns {Promise<boolean>}
     */
    async checkAuth() {
        try {
            const currentState = this.stateManager.getState();
            
            if (!currentState.auth.isAuthenticated || !currentState.auth.tokens?.access_token) {
                return false;
            }

            const token = currentState.auth.tokens.access_token;

            // بررسی اعتبار توکن دسترسی
            const tokenValidation = this.tokenManager.verifyToken(token);
            
            if (!tokenValidation.isValid) {
                // اگر توکن منقضی شده، سعی کن تمدید کنی
                if (tokenValidation.error.includes('منقضی')) {
                    try {
                        await this.refreshTokens();
                        return true;
                    } catch {
                        await this.logout();
                        return false;
                    }
                }
                
                await this.logout();
                return false;
            }

            // بارگذاری اطلاعات کاربر از دیتابیس
            const user = await this.authRepository.findUserById(tokenValidation.payload.userId);
            if (!user) {
                await this.logout();
                return false;
            }

            // به‌روزرسانی state با اطلاعات جدید
            await this.stateManager.dispatch('USER_UPDATE', user);
            this.currentUser = user;

            return true;

        } catch (error) {
            console.error('خطا در بررسی وضعیت احراز:', error);
            return false;
        }
    }

    /**
     * دریافت کاربر فعلی
     * @returns {Promise<UserResponseDTO|null>}
     */
    async getCurrentUser() {
        if (this.currentUser) {
            return UserResponseDTO.fromUserModel(this.currentUser);
        }

        const currentState = this.stateManager.getState();
        if (currentState.auth.user) {
            return UserResponseDTO.fromUserModel(currentState.auth.user);
        }

        return null;
    }

    /**
     * دریافت توکن فعلی
     * @returns {Promise<string|null>}
     */
    getCurrentToken() {
        if (this.currentTokens?.access_token) {
            return this.currentTokens.access_token;
        }

        const currentState = this.stateManager.getState();
        return currentState.auth.tokens?.access_token || null;
    }

    /**
     * به‌روزرسانی پروفایل کاربر
     * @param {Object} updateData - داده‌های به‌روزرسانی
     * @returns {Promise<UserResponseDTO>}
     */
    async updateProfile(updateData) {
        try {
            const currentState = this.stateManager.getState();
            const userId = currentState.auth.user?.id;

            if (!userId) {
                throw new Error('کاربر وارد سیستم نشده است');
            }

            // اعتبارسنجی داده‌ها
            if (updateData.email) {
                const emailValidation = this.validator.validateEmail(updateData.email);
                if (!emailValidation.isValid) {
                    throw new Error(emailValidation.error);
                }
                
                // بررسی تکراری نبودن ایمیل جدید
                if (updateData.email !== currentState.auth.user.email) {
                    const existingUser = await this.authRepository.findUserByEmail(updateData.email);
                    if (existingUser && existingUser.id !== userId) {
                        throw new Error('این ایمیل قبلاً توسط کاربر دیگری استفاده شده است');
                    }
                }
            }

            if (updateData.username) {
                const usernameValidation = this.validator.validateUsername(updateData.username);
                if (!usernameValidation.isValid) {
                    throw new Error(usernameValidation.error);
                }
            }

            if (updateData.phone) {
                const phoneValidation = this.validator.validatePhone(updateData.phone);
                if (!phoneValidation.isValid) {
                    throw new Error(phoneValidation.error);
                }
            }

            // به‌روزرسانی در دیتابیس
            const updatedUser = await this.authRepository.updateUser(userId, {
                ...updateData,
                updated_at: new Date().toISOString()
            });

            if (!updatedUser) {
                throw new Error('خطا در به‌روزرسانی پروفایل');
            }

            // به‌روزرسانی state
            await this.stateManager.dispatch('USER_UPDATE', updatedUser);
            this.currentUser = updatedUser;

            this.eventEmitter.emit('auth:profileUpdated', { 
                userId, 
                changes: Object.keys(updateData) 
            });

            return UserResponseDTO.fromUserModel(updatedUser);

        } catch (error) {
            console.error('خطا در به‌روزرسانی پروفایل:', error);
            this.eventEmitter.emit('auth:error', { 
                operation: 'updateProfile', 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * تغییر رمز عبور
     * @param {string} currentPassword - رمز عبور فعلی
     * @param {string} newPassword - رمز عبور جدید
     * @returns {Promise<boolean>}
     */
    async changePassword(currentPassword, newPassword) {
        try {
            const currentState = this.stateManager.getState();
            const user = currentState.auth.user;

            if (!user) {
                throw new Error('کاربر وارد سیستم نشده است');
            }

            // بررسی رمز عبور فعلی
            const isPasswordValid = await this.passwordHasher.verify(
                currentPassword, 
                user.password_hash
            );
            
            if (!isPasswordValid) {
                throw new Error('رمز عبور فعلی اشتباه است');
            }

            // اعتبارسنجی رمز عبور جدید
            const passwordValidation = this.validator.validatePassword(newPassword);
            if (!passwordValidation.isValid) {
                throw new Error(passwordValidation.error);
            }

            // هش کردن رمز عبور جدید
            const newSalt = this.passwordHasher.generateSalt();
            const newPasswordHash = await this.passwordHasher.hash(newPassword + newSalt);

            // به‌روزرسانی رمز عبور
            await this.authRepository.updateUser(user.id, {
                password_hash: newPasswordHash,
                salt: newSalt,
                password_changed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            // باطل کردن همه جلسات به جز جلسه فعلی (اختیاری)
            await this._revokeOtherSessions(user.id, currentState.auth.session_id);

            this.eventEmitter.emit('auth:passwordChanged', { userId: user.id });

            return true;

        } catch (error) {
            console.error('خطا در تغییر رمز عبور:', error);
            this.eventEmitter.emit('auth:error', { 
                operation: 'changePassword', 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * درخواست بازنشانی رمز عبور
     * @param {string} email - ایمیل کاربر
     * @returns {Promise<boolean>}
     */
    async requestPasswordReset(email) {
        try {
            const user = await this.authRepository.findUserByEmail(email);
            
            if (!user) {
                // برای امنیت، حتی اگر کاربر وجود نداشت، خطا نده
                return true;
            }

            const resetToken = this.tokenManager.generateToken(
                { userId: user.id, purpose: 'password-reset' },
                'access'
            );

            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 1); // 1 ساعت اعتبار

            await this.authRepository.saveResetToken({
                user_id: user.id,
                token: resetToken,
                expires_at: expiresAt.toISOString()
            });

            // اینجا می‌توانید ایمیل ارسال کنید
            console.log(`لینک بازنشانی رمز عبور برای ${email}: /reset-password?token=${resetToken}`);

            this.eventEmitter.emit('auth:passwordResetRequested', { email });

            return true;

        } catch (error) {
            console.error('خطا در درخواست بازنشانی رمز عبور:', error);
            throw new Error('خطا در ارسال درخواست بازنشانی رمز عبور');
        }
    }

    /**
     * بازنشانی رمز عبور با توکن
     * @param {string} token - توکن بازنشانی
     * @param {string} newPassword - رمز عبور جدید
     * @returns {Promise<boolean>}
     */
    async resetPassword(token, newPassword) {
        try {
            const verification = this.tokenManager.verifyToken(token);
            
            if (!verification.isValid || verification.payload.purpose !== 'password-reset') {
                throw new Error('توکن بازنشانی نامعتبر است');
            }

            const userId = verification.payload.userId;

            // اعتبارسنجی رمز عبور جدید
            const passwordValidation = this.validator.validatePassword(newPassword);
            if (!passwordValidation.isValid) {
                throw new Error(passwordValidation.error);
            }

            // هش کردن رمز عبور جدید
            const newSalt = this.passwordHasher.generateSalt();
            const newPasswordHash = await this.passwordHasher.hash(newPassword + newSalt);

            // به‌روزرسانی رمز عبور
            await this.authRepository.updateUser(userId, {
                password_hash: newPasswordHash,
                salt: newSalt,
                password_changed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            // باطل کردن همه جلسات
            await this._revokeAllSessions(userId);

            this.eventEmitter.emit('auth:passwordReset', { userId });

            return true;

        } catch (error) {
            console.error('خطا در بازنشانی رمز عبور:', error);
            throw error;
        }
    }

    // ============ متدهای خصوصی ============

    /**
     * ایجاد جلسه کاربر
     * @private
     */
    async _createSession(userId, accessToken, rememberMe = false, refreshToken = null, deviceInfo = null) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (rememberMe ? 30 : 7));
        
        const sessionData = {
            user_id: userId,
            access_token: accessToken,
            refresh_token: refreshToken,
            created_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            device_info: deviceInfo || navigator.userAgent,
            remember_me: rememberMe,
            last_activity: new Date().toISOString()
        };

        return await this.authRepository.saveSession(sessionData);
    }

    /**
     * به‌روزرسانی state احراز هویت
     * @private
     */
    async _updateAuthState(user, tokens, action) {
        const authData = {
            user: UserResponseDTO.fromUserModel(user),
            tokens: tokens,
            isAuthenticated: true,
            lastAction: action,
            lastUpdated: new Date().toISOString()
        };

        await this.stateManager.dispatch(
            action === 'register' ? 'USER_REGISTER' : 'USER_LOGIN',
            authData
        );

        this.currentUser = user;
        this.currentTokens = tokens;

        // ذخیره در localStorage
        this._saveAuthState(authData);
    }

    /**
     * باطل کردن جلسات قبلی
     * @private
     */
    async _revokePreviousSessions(userId) {
        try {
            await this.authRepository.deleteAllSessions(userId);
        } catch (error) {
            console.warn('خطا در باطل کردن جلسات قبلی:', error);
        }
    }

    /**
     * باطل کردن همه جلسات
     * @private
     */
    async _revokeAllSessions(userId) {
        try {
            await this.authRepository.deleteAllSessions(userId);
        } catch (error) {
            console.warn('خطا در باطل کردن همه جلسات:', error);
        }
    }

    /**
     * باطل کردن جلسات دیگر
     * @private
     */
    async _revokeOtherSessions(userId, currentSessionId) {
        try {
            await this.authRepository.deleteOtherSessions(userId, currentSessionId);
        } catch (error) {
            console.warn('خطا در باطل کردن جلسات دیگر:', error);
        }
    }

    /**
     * بارگذاری وضعیت احراز از localStorage
     * @private
     */
    _loadAuthState() {
        try {
            const saved = localStorage.getItem('farsinglish_auth');
            if (saved) {
                const parsed = JSON.parse(saved);
                // بررسی اعتبار
                if (parsed.expires_at && new Date(parsed.expires_at) > new Date()) {
                    return parsed;
                }
            }
        } catch (error) {
            console.warn('خطا در بارگذاری وضعیت احراز:', error);
        }
        return null;
    }

    /**
     * ذخیره وضعیت احراز در localStorage
     * @private
     */
    _saveAuthState(authData) {
        try {
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24); // 24 ساعت
            
            const saveData = {
                ...authData,
                expires_at: expiresAt.toISOString()
            };
            
            localStorage.setItem('farsinglish_auth', JSON.stringify(saveData));
        } catch (error) {
            console.warn('خطا در ذخیره وضعیت احراز:', error);
        }
    }

    /**
     * پاک‌سازی localStorage
     * @private
     */
    _clearAuthStorage() {
        try {
            localStorage.removeItem('farsinglish_auth');
        } catch (error) {
            console.warn('خطا در پاک‌سازی localStorage:', error);
        }
    }

    /**
     * دریافت رویداد emitter
     * @returns {AuthEventEmitter}
     */
    getEventEmitter() {
        return this.eventEmitter;
    }
}

// ============ Factory برای ایجاد AuthService ============
class AuthServiceFactory {
    static create(authRepository, stateManager, options = {}) {
        const tokenManager = options.tokenManager || new JWTTokenManager(
            options.secret || 'farsinglish-secret-key',
            {
                accessTokenExpiry: options.accessTokenExpiry,
                refreshTokenExpiry: options.refreshTokenExpiry,
                issuer: options.issuer || 'farsinglish'
            }
        );
        
        const validator = options.validator || new AuthValidatorImpl();
        const passwordHasher = options.passwordHasher || new PasswordHasherImpl();
        const rateLimiter = options.rateLimiter || new RateLimiter(
            options.maxLoginAttempts || 5,
            options.rateLimitWindow || 15 * 60 * 1000
        );
        const eventEmitter = options.eventEmitter || new AuthEventEmitter();
        
        const refreshTokenManager = new RefreshTokenManager(authRepository, tokenManager);

        const authService = new AuthService({
            authRepository,
            tokenManager,
            validator,
            stateManager,
            passwordHasher,
            rateLimiter,
            eventEmitter,
            refreshTokenManager
        });

        // مقداردهی اولیه
        authService.init().catch(console.warn);

        return authService;
    }

    static createWithMock(stateManager, options = {}) {
        // Repository Mock برای تست‌ها
        const mockRepository = {
            users: new Map(),
            sessions: new Map(),
            refreshTokens: new Map(),

            async createUser(userData) {
                const id = `user-${Date.now()}-${Math.random().toString(36).substring(2)}`;
                const user = { id, ...userData, created_at: new Date().toISOString() };
                this.users.set(id, user);
                this.users.set(userData.email, user);
                return user;
            },

            async findUserByEmail(email) {
                return this.users.get(email) || null;
            },

            async findUserById(id) {
                return this.users.get(id) || null;
            },

            async updateUser(id, updateData) {
                const user = this.users.get(id);
                if (user) {
                    const updated = { ...user, ...updateData };
                    this.users.set(id, updated);
                    this.users.set(user.email, updated);
                    return updated;
                }
                return null;
            },

            async saveSession(sessionData) {
                const id = `session-${Date.now()}`;
                const session = { id, ...sessionData };
                this.sessions.set(id, session);
                this.sessions.set(sessionData.user_id, session);
                return session;
            },

            async getSession(userId) {
                return this.sessions.get(userId) || null;
            },

            async deleteSession(userId, sessionId) {
                this.sessions.delete(userId);
                if (sessionId) {
                    this.sessions.delete(sessionId);
                }
                return true;
            },

            async deleteAllSessions(userId) {
                this.sessions.clear();
                return true;
            },

            async deleteOtherSessions(userId, currentSessionId) {
                return true;
            },

            async saveRefreshToken(tokenData) {
                const id = `refresh-${Date.now()}`;
                const token = { id, ...tokenData };
                this.refreshTokens.set(tokenData.token, token);
                return token;
            },

            async findRefreshToken(token) {
                return this.refreshTokens.get(token) || null;
            },

            async deleteRefreshToken(token) {
                this.refreshTokens.delete(token);
                return true;
            },

            async saveResetToken(tokenData) {
                return true;
            }
        };

        return AuthServiceFactory.create(mockRepository, stateManager, options);
    }
}

// ============ Export ============
export {
    AuthService,
    AuthServiceFactory,
    AuthValidatorImpl,
    JWTTokenManager,
    PasswordHasherImpl,
    RateLimiter,
    AuthEventEmitter,
    RefreshTokenManager,
    RegisterRequestDTO,
    LoginRequestDTO,
    RefreshTokenRequestDTO,
    AuthResponseDTO,
    UserResponseDTO,
    TokenResponseDTO
};
