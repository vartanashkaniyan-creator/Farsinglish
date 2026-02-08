// core/auth/auth-service.js
/**
 * Auth Service - مدیریت احراز هویت کاربران
 * مسئولیت: ثبت‌نام، ورود، خروج و مدیریت جلسه کاربر با الگوی Repository
 * اصل SRP: فقط عملیات احراز هویت
 * اصل DIP: وابستگی به Repository Interface نه پیاده‌سازی
 * اصل ISP: اینترفیس‌های مجزا برای عملیات مختلف
 * اصل LSP: کلاس‌های پیاده‌سازی قابل جایگزینی با اینترفیس
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

// ============ DTOs (Data Transfer Objects) ============
class RegisterRequestDTO {
    constructor(data) {
        this.email = data.email?.trim() || '';
        this.password = data.password || '';
        this.username = data.username?.trim() || '';
        this.phone = data.phone?.trim() || '';
        this.language = data.language || 'fa';
    }

    toUserModel() {
        return {
            email: this.email,
            username: this.username,
            phone: this.phone,
            language: this.language,
            level: 1,
            xp: 0,
            streak_days: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    }
}

class LoginRequestDTO {
    constructor(data) {
        this.email = data.email?.trim() || '';
        this.password = data.password || '';
        this.rememberMe = data.rememberMe || false;
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
    }

    static fromUserModel(user) {
        return new UserResponseDTO(user);
    }
}

class AuthResponseDTO {
    constructor(user, token, session) {
        this.user = UserResponseDTO.fromUserModel(user);
        this.token = token;
        this.session_id = session?.id;
        this.expires_at = session?.expires_at;
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
        
        // بررسی پیچیدگی رمز عبور
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        
        if (!hasLowerCase || !hasNumbers) {
            return { 
                isValid: false, 
                error: 'رمز عبور باید شامل حروف کوچک و اعداد باشد' 
            };
        }
        
        return { isValid: true, error: null };
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
            validatedData: data
        };
    }
}

// ============ Token Manager ============
class JWTTokenManager {
    constructor(secret = 'farsinglish-secret-key', expiresIn = '7d') {
        this.secret = secret;
        this.expiresIn = expiresIn;
    }

    generateToken(payload) {
        // شبیه‌سازی JWT (در پروژه واقعی از library استفاده شود)
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const expiration = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 روز
        const data = {
            ...payload,
            exp: expiration
        };
        const encodedData = btoa(JSON.stringify(data));
        const signature = btoa(this.secret + encodedData);
        
        return `${header}.${encodedData}.${signature}`;
    }

    verifyToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return { isValid: false, error: 'فرمت توکن نامعتبر است' };
            }
            
            const encodedData = parts[1];
            const data = JSON.parse(atob(encodedData));
            
            // بررسی انقضا
            if (data.exp && data.exp < Date.now()) {
                return { isValid: false, error: 'توکن منقضی شده است' };
            }
            
            // بررسی امضا (ساده‌سازی شده)
            const expectedSignature = btoa(this.secret + encodedData);
            if (parts[2] !== expectedSignature) {
                return { isValid: false, error: 'امضای توکن نامعتبر است' };
            }
            
            return { 
                isValid: true, 
                payload: data,
                error: null 
            };
        } catch (error) {
            return { 
                isValid: false, 
                error: 'توکن نامعتبر است' 
            };
        }
    }

    decodeToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return null;
            }
            
            const encodedData = parts[1];
            return JSON.parse(atob(encodedData));
        } catch (error) {
            return null;
        }
    }

    isTokenExpired(token) {
        const decoded = this.decodeToken(token);
        if (!decoded || !decoded.exp) {
            return true;
        }
        
        return decoded.exp < Date.now();
    }
}

// ============ Auth Service ============
class AuthService {
    constructor(authRepository, tokenManager, validator, stateManager) {
        if (!authRepository || !tokenManager || !validator || !stateManager) {
            throw new Error('همه وابستگی‌های AuthService باید ارائه شوند');
        }
        
        this.authRepository = authRepository;
        this.tokenManager = tokenManager;
        this.validator = validator;
        this.stateManager = stateManager;
        this.currentUser = null;
        this.currentToken = null;
    }

    /**
     * ثبت‌نام کاربر جدید
     * @param {RegisterRequestDTO} registerData - داده‌های ثبت‌نام
     * @returns {Promise<AuthResponseDTO>}
     */
    async register(registerData) {
        try {
            // اعتبارسنجی داده‌ها
            const validation = this.validator.validateRegisterData(registerData);
            if (!validation.isValid) {
                throw new Error(validation.errors.join(', '));
            }

            // بررسی تکراری نبودن ایمیل
            const existingUser = await this.authRepository.findUserByEmail(registerData.email);
            if (existingUser) {
                throw new Error('این ایمیل قبلاً ثبت شده است');
            }

            // ایجاد کاربر در دیتابیس
            const userDTO = new RegisterRequestDTO(registerData);
            const userModel = userDTO.toUserModel();
            const createdUser = await this.authRepository.createUser(userModel);

            if (!createdUser || !createdUser.id) {
                throw new Error('خطا در ایجاد حساب کاربری');
            }

            // ایجاد توکن
            const tokenPayload = {
                userId: createdUser.id,
                email: createdUser.email,
                level: createdUser.level
            };
            const token = this.tokenManager.generateToken(tokenPayload);

            // ایجاد جلسه
            const session = await this._createSession(createdUser.id, token);

            // به‌روزرسانی state
            await this._updateAuthState(createdUser, token, 'register');

            // بازگشت پاسخ
            return new AuthResponseDTO(createdUser, token, session);

        } catch (error) {
            console.error('خطا در ثبت‌نام:', error);
            throw error;
        }
    }

    /**
     * ورود کاربر
     * @param {LoginRequestDTO} loginData - داده‌های ورود
     * @returns {Promise<AuthResponseDTO>}
     */
    async login(loginData) {
        try {
            // اعتبارسنجی داده‌ها
            if (!loginData.email || !loginData.password) {
                throw new Error('ایمیل و رمز عبور الزامی است');
            }

            // یافتن کاربر
            const user = await this.authRepository.findUserByEmail(loginData.email);
            if (!user) {
                throw new Error('کاربری با این ایمیل یافت نشد');
            }

            // بررسی رمز عبور (ساده‌سازی شده - در پروژه واقعی از hashing استفاده شود)
            // TODO: در پیاده‌سازی واقعی، رمز عبور hash شود
            if (user.password !== loginData.password) {
                throw new Error('رمز عبور اشتباه است');
            }

            // بررسی وجود جلسه فعال
            const existingSession = await this.authRepository.getSession(user.id);
            if (existingSession && !this.tokenManager.isTokenExpired(existingSession.token)) {
                // استفاده از جلسه موجود
                await this._updateAuthState(user, existingSession.token, 'login');
                return new AuthResponseDTO(user, existingSession.token, existingSession);
            }

            // ایجاد توکن جدید
            const tokenPayload = {
                userId: user.id,
                email: user.email,
                level: user.level
            };
            const token = this.tokenManager.generateToken(tokenPayload);

            // ایجاد یا به‌روزرسانی جلسه
            const session = await this._createSession(user.id, token, loginData.rememberMe);

            // به‌روزرسانی آخرین فعالیت
            await this.authRepository.updateUser(user.id, {
                last_active: new Date().toISOString()
            });

            // به‌روزرسانی state
            await this._updateAuthState(user, token, 'login');

            return new AuthResponseDTO(user, token, session);

        } catch (error) {
            console.error('خطا در ورود:', error);
            throw error;
        }
    }

    /**
     * خروج کاربر
     * @returns {Promise<void>}
     */
    async logout() {
        try {
            const currentState = this.stateManager.getState();
            const userId = currentState.auth.user?.id;

            if (userId) {
                // حذف جلسه از دیتابیس
                await this.authRepository.deleteSession(userId);
                
                // به‌روزرسانی آخرین فعالیت
                await this.authRepository.updateUser(userId, {
                    last_active: new Date().toISOString()
                });
            }

            // پاک‌سازی state
            await this.stateManager.dispatch('USER_LOGOUT');
            
            // پاک‌سازی داده‌های محلی
            this.currentUser = null;
            this.currentToken = null;

            console.log('کاربر با موفقیت خارج شد');

        } catch (error) {
            console.error('خطا در خروج:', error);
            throw error;
        }
    }

    /**
     * بررسی وضعیت احراز هویت
     * @returns {Promise<boolean>}
     */
    async checkAuth() {
        try {
            const currentState = this.stateManager.getState();
            
            if (!currentState.auth.isAuthenticated || !currentState.auth.token) {
                return false;
            }

            // بررسی اعتبار توکن
            const tokenValidation = this.tokenManager.verifyToken(currentState.auth.token);
            if (!tokenValidation.isValid) {
                // توکن نامعتبر - خروج خودکار
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
            this.currentToken = currentState.auth.token;

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

            return UserResponseDTO.fromUserModel(updatedUser);

        } catch (error) {
            console.error('خطا در به‌روزرسانی پروفایل:', error);
            throw error;
        }
    }

    /**
     * ایجاد جلسه کاربر
     * @private
     */
    async _createSession(userId, token, rememberMe = false) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (rememberMe ? 30 : 7)); // 30 روز یا 7 روز
        
        const sessionData = {
            user_id: userId,
            token: token,
            created_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            device_info: navigator.userAgent,
            remember_me: rememberMe
        };

        return await this.authRepository.saveSession(sessionData);
    }

    /**
     * به‌روزرسانی state احراز هویت
     * @private
     */
    async _updateAuthState(user, token, action) {
        const authData = {
            user: UserResponseDTO.fromUserModel(user),
            token: token
        };

        await this.stateManager.dispatch(
            action === 'register' ? 'USER_REGISTER' : 'USER_LOGIN',
            authData
        );

        this.currentUser = user;
        this.currentToken = token;
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

            // TODO: در پیاده‌سازی واقعی، بررسی hash رمز عبور
            if (user.password !== currentPassword) {
                throw new Error('رمز عبور فعلی اشتباه است');
            }

            // اعتبارسنجی رمز عبور جدید
            const passwordValidation = this.validator.validatePassword(newPassword);
            if (!passwordValidation.isValid) {
                throw new Error(passwordValidation.error);
            }

            // به‌روزرسانی رمز عبور
            await this.authRepository.updateUser(user.id, {
                password: newPassword, // TODO: hash شود
                updated_at: new Date().toISOString()
            });

            return true;

        } catch (error) {
            console.error('خطا در تغییر رمز عبور:', error);
            throw error;
        }
    }
}

// ============ Factory برای ایجاد AuthService ============
class AuthServiceFactory {
    static create(authRepository, stateManager, options = {}) {
        const tokenManager = new JWTTokenManager(
            options.secret || 'farsinglish-secret-key',
            options.expiresIn || '7d'
        );
        
        const validator = new AuthValidatorImpl();
        
        return new AuthService(
            authRepository,
            tokenManager,
            validator,
            stateManager
        );
    }
}

// ============ Export ============
export {
    AuthService,
    AuthServiceFactory,
    IAuthRepository,
    IAuthValidator,
    ITokenManager,
    RegisterRequestDTO,
    LoginRequestDTO,
    UserResponseDTO,
    AuthResponseDTO,
    AuthValidatorImpl,
    JWTTokenManager
};
