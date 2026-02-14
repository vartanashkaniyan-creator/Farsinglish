```javascript
// core/audio/audio-service.js
/**
 * Audio Service - مدیریت پخش صدا و تلفظ
 * مسئولیت: پخش فایل‌های صوتی، مدیریت تلفظ، و کنترل صدا
 * اصل SRP: فقط مسئول عملیات مرتبط با صدا
 * اصل DIP: وابسته به Web Audio API از طریق abstraction
 * اصل OCP: قابل توسعه برای منابع صوتی مختلف
 */

// ============ Types and Enums ============
const AudioState = {
    IDLE: 'idle',
    LOADING: 'loading',
    PLAYING: 'playing',
    PAUSED: 'paused',
    STOPPED: 'stopped',
    ENDED: 'ended',
    ERROR: 'error'
};

const AudioType = {
    WORD_PRONUNCIATION: 'word_pronunciation',
    SENTENCE_AUDIO: 'sentence_audio',
    EFFECT_SOUND: 'effect_sound',
    BACKGROUND_MUSIC: 'background_music',
    RECORDING: 'recording'
};

const VoiceAccent = {
    US: 'us',       // American
    UK: 'uk',       // British
    AU: 'au',       // Australian
    CA: 'ca',       // Canadian
    IN: 'in'        // Indian
};

const AudioPriority = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
    BACKGROUND: 3
};

// ============ DTOs ============
class AudioConfig {
    constructor(config = {}) {
        this.volume = config.volume ?? 1.0; // 0-1
        this.muted = config.muted ?? false;
        this.loop = config.loop ?? false;
        this.autoplay = config.autoplay ?? false;
        this.crossOrigin = config.crossOrigin ?? 'anonymous';
        this.preload = config.preload ?? 'metadata';
        this.preservesPitch = config.preservesPitch ?? true;
        this.playbackRate = config.playbackRate ?? 1.0;
        this.currentTime = config.currentTime ?? 0;
        this.fadeIn = config.fadeIn ?? 0;
        this.fadeOut = config.fadeOut ?? 0;
        this.audioContext = config.audioContext ?? null;
    }

    validate() {
        if (this.volume < 0 || this.volume > 1) {
            throw new Error('Volume must be between 0 and 1');
        }
        if (this.playbackRate <= 0) {
            throw new Error('Playback rate must be positive');
        }
        return true;
    }
}

class AudioResource {
    constructor(data = {}) {
        this.id = data.id || `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.url = data.url;
        this.type = data.type || AudioType.WORD_PRONUNCIATION;
        this.text = data.text || '';
        this.language = data.language || 'en';
        this.accent = data.accent || VoiceAccent.US;
        this.duration = data.duration || 0;
        this.size = data.size || 0;
        this.format = data.format || 'mp3';
        this.priority = data.priority ?? AudioPriority.MEDIUM;
        this.metadata = data.metadata || {};
        this.cacheable = data.cacheable ?? true;
        this.tts = data.tts ?? false; // آیا نیاز به Text-to-Speech دارد
    }

    get isRemote() {
        return this.url && (this.url.startsWith('http') || this.url.startsWith('https'));
    }

    get isLocal() {
        return !this.isRemote;
    }
}

class AudioPlaybackResult {
    constructor(data = {}) {
        this.id = data.id;
        this.success = data.success ?? false;
        this.duration = data.duration || 0;
        this.currentTime = data.currentTime || 0;
        this.volume = data.volume || 0;
        this.state = data.state || AudioState.IDLE;
        this.error = data.error || null;
        this.startTime = data.startTime || null;
        this.endTime = data.endTime || null;
    }
}

// ============ Audio Cache ============
class AudioCache {
    constructor(maxSize = 50, maxAge = 3600000) { // 1 ساعت
        this.cache = new Map();
        this.maxSize = maxSize;
        this.maxAge = maxAge;
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    get(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            this.stats.misses++;
            return null;
        }

        // بررسی انقضا
        if (Date.now() - item.timestamp > this.maxAge) {
            this.cache.delete(key);
            this.stats.evictions++;
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return item.data;
    }

    set(key, data) {
        // حذف قدیمی‌ترین اگر ظرفیت پر است
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this._getOldestKey();
            this.cache.delete(oldestKey);
            this.stats.evictions++;
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    has(key) {
        return this.cache.has(key) && !this._isExpired(key);
    }

    delete(key) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, evictions: 0 };
    }

    getStats() {
        const totalRequests = this.stats.hits + this.stats.misses;
        return {
            size: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            evictions: this.stats.evictions,
            hitRate: totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0
        };
    }

    _isExpired(key) {
        const item = this.cache.get(key);
        return item && (Date.now() - item.timestamp > this.maxAge);
    }

    _getOldestKey() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, item] of this.cache.entries()) {
            if (item.timestamp < oldestTime) {
                oldestTime = item.timestamp;
                oldestKey = key;
            }
        }

        return oldestKey;
    }
}

// ============ Audio Queue ============
class AudioQueue {
    constructor() {
        this.queue = [];
        this.currentItem = null;
        this.processing = false;
    }

    enqueue(item, priority = AudioPriority.MEDIUM) {
        const queueItem = {
            ...item,
            priority,
            timestamp: Date.now()
        };

        // insert based on priority
        const index = this.queue.findIndex(i => i.priority > priority);
        if (index === -1) {
            this.queue.push(queueItem);
        } else {
            this.queue.splice(index, 0, queueItem);
        }
    }

    dequeue() {
        return this.queue.shift();
    }

    peek() {
        return this.queue[0];
    }

    remove(id) {
        const index = this.queue.findIndex(item => item.id === id);
        if (index !== -1) {
            return this.queue.splice(index, 1)[0];
        }
        return null;
    }

    clear() {
        this.queue = [];
        this.currentItem = null;
    }

    size() {
        return this.queue.length;
    }

    isEmpty() {
        return this.queue.length === 0;
    }

    getQueue() {
        return [...this.queue];
    }
}

// ============ Audio Visualizer ============
class AudioVisualizer {
    constructor(audioContext, analyser) {
        this.audioContext = audioContext;
        this.analyser = analyser;
        this.canvas = null;
        ctx = null;
        this.animationFrame = null;
        this.isActive = false;
    }

    connect(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        this.analyser.fftSize = 256;
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
    }

    start() {
        if (!this.canvas || !this.ctx) return;
        
        this.isActive = true;
        this._draw();
    }

    stop() {
        this.isActive = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    _draw() {
        if (!this.isActive) return;

        this.animationFrame = requestAnimationFrame(() => this._draw());

        this.analyser.getByteFrequencyData(this.dataArray);

        const width = this.canvas.width;
        const height = this.canvas.height;
        const barWidth = (width / this.dataArray.length) * 2.5;

        this.ctx.fillStyle = 'rgb(20, 20, 20)';
        this.ctx.fillRect(0, 0, width, height);

        let x = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            const barHeight = this.dataArray[i] / 255 * height;

            const gradient = this.ctx.createLinearGradient(0, height, 0, 0);
            gradient.addColorStop(0, '#4facfe');
            gradient.addColorStop(1, '#00f2fe');

            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
        }
    }
}

// ============ Audio Recorder ============
class AudioRecorder {
    constructor(options = {}) {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.isRecording = false;
        this.recordingTime = 0;
        this.timerInterval = null;
        this.options = {
            mimeType: options.mimeType || 'audio/webm',
            audioBitsPerSecond: options.audioBitsPerSecond || 128000,
            ...options
        };
        this.onDataAvailable = options.onDataAvailable || null;
        this.onStop = options.onStop || null;
        this.onError = options.onError || null;
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(this.stream, this.options);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    if (this.onDataAvailable) {
                        this.onDataAvailable(event.data);
                    }
                }
            };

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: this.options.mimeType });
                if (this.onStop) {
                    this.onStop(audioBlob);
                }
                this._stopStream();
            };

            this.mediaRecorder.onerror = (error) => {
                if (this.onError) {
                    this.onError(error);
                }
            };

            this.mediaRecorder.start(1000); // collect data every second
            this.isRecording = true;
            this._startTimer();

            return true;

        } catch (error) {
            console.error('Error starting recording:', error);
            if (this.onError) {
                this.onError(error);
            }
            return false;
        }
    }

    stop() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this._stopTimer();
        }
    }

    pause() {
        if (this.mediaRecorder && this.isRecording && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
            this._stopTimer();
        }
    }

    resume() {
        if (this.mediaRecorder && this.isRecording && this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
            this._startTimer();
        }
    }

    getRecordingTime() {
        return this.recordingTime;
    }

    _startTimer() {
        this.timerInterval = setInterval(() => {
            this.recordingTime++;
        }, 1000);
    }

    _stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    _stopStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }
}

// ============ TTS Engine ============
class TTSEngine {
    constructor() {
        this.synth = window.speechSynthesis;
        this.supported = !!this.synth;
        this.voices = [];
        this.currentUtterance = null;
        this._loadVoices();
    }

    speak(text, options = {}) {
        if (!this.supported) {
            throw new Error('Text-to-Speech not supported');
        }

        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(text);
            
            utterance.lang = options.language || 'en-US';
            utterance.rate = options.rate || 1.0;
            utterance.pitch = options.pitch || 1.0;
            utterance.volume = options.volume || 1.0;

            // انتخاب voice مناسب
            if (options.voice) {
                utterance.voice = options.voice;
            } else if (options.accent) {
                utterance.voice = this._findVoiceByAccent(options.accent, options.language);
            }

            utterance.onstart = () => {
                if (options.onStart) options.onStart();
            };

            utterance.onend = () => {
                resolve(new AudioPlaybackResult({
                    success: true,
                    duration: this._estimateDuration(text)
                }));
                if (options.onEnd) options.onEnd();
            };

            utterance.onerror = (error) => {
                reject(error);
                if (options.onError) options.onError(error);
            };

            this.currentUtterance = utterance;
            this.synth.speak(utterance);
        });
    }

    stop() {
        if (this.supported && this.synth.speaking) {
            this.synth.cancel();
        }
    }

    pause() {
        if (this.supported && this.synth.speaking) {
            this.synth.pause();
        }
    }

    resume() {
        if (this.supported && this.synth.paused) {
            this.synth.resume();
        }
    }

    getVoices() {
        return this.voices;
    }

    isSpeaking() {
        return this.supported && this.synth.speaking;
    }

    isPaused() {
        return this.supported && this.synth.paused;
    }

    _loadVoices() {
        if (!this.supported) return;

        // بارگذاری اولیه
        this.voices = this.synth.getVoices();

        // آپدیت بعد از بارگذاری کامل
        this.synth.onvoiceschanged = () => {
            this.voices = this.synth.getVoices();
        };
    }

    _findVoiceByAccent(accent, language = 'en') {
        const langMap = {
            [VoiceAccent.US]: 'en-US',
            [VoiceAccent.UK]: 'en-GB',
            [VoiceAccent.AU]: 'en-AU',
            [VoiceAccent.CA]: 'en-CA',
            [VoiceAccent.IN]: 'en-IN'
        };

        const targetLang = langMap[accent] || `${language}-${accent.toUpperCase()}`;
        
        return this.voices.find(voice => 
            voice.lang === targetLang || voice.lang.startsWith(targetLang)
        );
    }

    _estimateDuration(text) {
        // تخمین ساده: ۱۵۰ کلمه در دقیقه
        const words = text.split(/\s+/).length;
        return (words / 150) * 60 * 1000; // میلی‌ثانیه
    }
}

// ============ Audio Player ============
class AudioPlayer {
    constructor(config = {}) {
        this.config = new AudioConfig(config);
        this.config.validate();

        this.audioContext = null;
        this.audioElement = null;
        this.source = null;
        this.gainNode = null;
        this.analyser = null;
        this.state = AudioState.IDLE;
        this.resource = null;
        this.playbackStartTime = null;
        this.duration = 0;
        this.fadeInterval = null;
        this.listeners = new Map();

        this._initAudioContext();
        this._createAudioElement();
    }

    async load(resource) {
        try {
            this.setState(AudioState.LOADING);
            this.resource = resource;

            if (resource.tts) {
                // برای TTS از engine جداگانه استفاده می‌شود
                return;
            }

            // برای فایل صوتی
            if (this.audioElement) {
                this.audioElement.src = resource.url;
                this.audioElement.load();

                await new Promise((resolve, reject) => {
                    const canPlayHandler = () => {
                        this.duration = this.audioElement.duration;
                        this.setState(AudioState.IDLE);
                        this.audioElement.removeEventListener('canplaythrough', canPlayHandler);
                        this.audioElement.removeEventListener('error', errorHandler);
                        resolve();
                    };

                    const errorHandler = (error) => {
                        this.setState(AudioState.ERROR);
                        this.audioElement.removeEventListener('canplaythrough', canPlayHandler);
                        this.audioElement.removeEventListener('error', errorHandler);
                        reject(error);
                    };

                    this.audioElement.addEventListener('canplaythrough', canPlayHandler);
                    this.audioElement.addEventListener('error', errorHandler);
                });
            }

        } catch (error) {
            this.setState(AudioState.ERROR);
            throw error;
        }
    }

    async play() {
        if (!this.audioElement && !this.resource?.tts) {
            throw new Error('No audio loaded');
        }

        try {
            if (this.resource?.tts) {
                // استفاده از TTS
                const tts = new TTSEngine();
                await tts.speak(this.resource.text, {
                    language: this.resource.language,
                    accent: this.resource.accent,
                    rate: this.config.playbackRate,
                    volume: this.config.volume
                });
            } else {
                // پخش فایل صوتی
                await this.audioElement.play();
                
                if (this.config.fadeIn > 0) {
                    this._fadeIn();
                }

                this.setState(AudioState.PLAYING);
                this.playbackStartTime = Date.now();
            }

            return new AudioPlaybackResult({
                id: this.resource?.id,
                success: true,
                state: AudioState.PLAYING
            });

        } catch (error) {
            this.setState(AudioState.ERROR);
            throw error;
        }
    }

    pause() {
        if (this.audioElement && this.state === AudioState.PLAYING) {
            this.audioElement.pause();
            this.setState(AudioState.PAUSED);
            
            if (this.config.fadeOut > 0) {
                this._fadeOut();
            }
        }
    }

    stop() {
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
            this.setState(AudioState.STOPPED);
            
            if (this.fadeInterval) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
            }
        }
    }

    resume() {
        if (this.audioElement && this.state === AudioState.PAUSED) {
            this.audioElement.play();
            this.setState(AudioState.PLAYING);
        }
    }

    seek(time) {
        if (this.audioElement) {
            this.audioElement.currentTime = time;
        }
    }

    setVolume(volume) {
        this.config.volume = Math.max(0, Math.min(1, volume));
        
        if (this.audioElement) {
            this.audioElement.volume = this.config.muted ? 0 : this.config.volume;
        }
        
        if (this.gainNode) {
            this.gainNode.gain.value = this.config.muted ? 0 : this.config.volume;
        }
    }

    setMuted(muted) {
        this.config.muted = muted;
        this.setVolume(this.config.volume);
    }

    setPlaybackRate(rate) {
        if (rate > 0 && this.audioElement) {
            this.config.playbackRate = rate;
            this.audioElement.playbackRate = rate;
        }
    }

    getCurrentTime() {
        return this.audioElement?.currentTime || 0;
    }

    getDuration() {
        return this.duration || this.audioElement?.duration || 0;
    }

    getVolume() {
        return this.config.volume;
    }

    isMuted() {
        return this.config.muted;
    }

    isPlaying() {
        return this.state === AudioState.PLAYING;
    }

    isPaused() {
        return this.state === AudioState.PAUSED;
    }

    isStopped() {
        return this.state === AudioState.STOPPED;
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    createVisualizer(canvas) {
        if (!this.audioContext || !this.analyser) return null;

        const visualizer = new AudioVisualizer(this.audioContext, this.analyser);
        visualizer.connect(canvas);
        return visualizer;
    }

    destroy() {
        this.stop();
        
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }

        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }

        if (this.analyser) {
            this.analyser.disconnect();
            this.analyser = null;
        }

        if (this.audioElement) {
            this.audioElement.src = '';
            this.audioElement.load();
            this.audioElement = null;
        }

        if (this.audioContext?.state !== 'closed') {
            this.audioContext?.close();
        }

        this.listeners.clear();
    }

    // ============ Private Methods ============

    _initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.analyser = this.audioContext.createAnalyser();

            this.gainNode.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            this.setVolume(this.config.volume);

        } catch (error) {
            console.warn('Web Audio API not supported:', error);
            this.audioContext = null;
        }
    }

    _createAudioElement() {
        this.audioElement = new Audio();
        this.audioElement.volume = this.config.muted ? 0 : this.config.volume;
        this.audioElement.loop = this.config.loop;
        this.audioElement.autoplay = this.config.autoplay;
        this.audioElement.preload = this.config.preload;
        this.audioElement.crossOrigin = this.config.crossOrigin;
        this.audioElement.playbackRate = this.config.playbackRate;

        // Event listeners
        this.audioElement.addEventListener('ended', () => {
            this.setState(AudioState.ENDED);
            this._emit('ended', { id: this.resource?.id });
        });

        this.audioElement.addEventListener('timeupdate', () => {
            this._emit('timeupdate', {
                currentTime: this.audioElement.currentTime,
                duration: this.audioElement.duration
            });
        });

        this.audioElement.addEventListener('error', (error) => {
            this.setState(AudioState.ERROR);
            this._emit('error', error);
        });

        // Connect to Web Audio API if available
        if (this.audioContext && this.gainNode) {
            this.source = this.audioContext.createMediaElementSource(this.audioElement);
            this.source.connect(this.gainNode);
        }
    }

    _fadeIn() {
        if (!this.gainNode) return;

        const steps = 20;
        const stepTime = this.config.fadeIn / steps;
        let currentStep = 0;

        this.gainNode.gain.value = 0;

        this.fadeInterval = setInterval(() => {
            currentStep++;
            this.gainNode.gain.value = (currentStep / steps) * this.config.volume;

            if (currentStep >= steps) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
                this.gainNode.gain.value = this.config.volume;
            }
        }, stepTime * 1000);
    }

    _fadeOut() {
        if (!this.gainNode) return;

        const steps = 20;
        const stepTime = this.config.fadeOut / steps;
        let currentStep = 0;
        const startVolume = this.gainNode.gain.value;

        this.fadeInterval = setInterval(() => {
            currentStep++;
            this.gainNode.gain.value = startVolume * (1 - currentStep / steps);

            if (currentStep >= steps) {
                clearInterval(this.fadeInterval);
                this.fadeInterval = null;
                this.gainNode.gain.value = 0;
                this.pause();
            }
        }, stepTime * 1000);
    }

    setState(newState) {
        this.state = newState;
        this._emit('stateChange', { state: newState });
    }

    _emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} listener:`, error);
                }
            });
        }
    }
}

// ============ Main Audio Service ============
class AudioService {
    constructor(config = {}) {
        this.config = {
            maxCacheSize: config.maxCacheSize || 50,
            cacheMaxAge: config.cacheMaxAge || 3600000,
            defaultVolume: config.defaultVolume ?? 0.8,
            enableQueue: config.enableQueue ?? true,
            enableCache: config.enableCache ?? true,
            preloadNext: config.preloadNext ?? true,
            ...config
        };

        this.cache = new AudioCache(this.config.maxCacheSize, this.config.cacheMaxAge);
        this.queue = new AudioQueue();
        this.players = new Map();
        this.ttsEngine = null;
        this.activePlayer = null;
        this.isMuted = false;
        this.globalVolume = this.config.defaultVolume;
        this.listeners = new Map();

        this._initTTS();
    }

    /**
     * پخش فایل صوتی
     */
    async play(resource, options = {}) {
        try {
            const audioResource = resource instanceof AudioResource ? resource : new AudioResource(resource);
            const config = new AudioConfig({ ...this.config, ...options });

            // بررسی کش
            if (this.config.enableCache && audioResource.cacheable) {
                const cached = this.cache.get(audioResource.url);
                if (cached) {
                    return this._playCached(cached, config);
                }
            }

            // ایجاد player جدید
            const player = new AudioPlayer(config);
            await player.load(audioResource);

            // ذخیره در کش
            if (this.config.enableCache && audioResource.cacheable) {
                this.cache.set(audioResource.url, player);
            }

            // پخش
            const result = await player.play();

            // مدیریت players
            this.players.set(audioResource.id, player);
            this.activePlayer = player;

            // پیش‌بارگذاری بعدی اگر لازم باشد
            if (this.config.preloadNext && resource.nextUrl) {
                this.preload(resource.nextUrl);
            }

            return result;

        } catch (error) {
            console.error('Error playing audio:', error);
            throw error;
        }
    }

    /**
     * پخش با اولویت (از طریق صف)
     */
    async playWithPriority(resource, priority = AudioPriority.MEDIUM) {
        if (!this.config.enableQueue) {
            return this.play(resource);
        }

        return new Promise((resolve, reject) => {
            const item = {
                id: resource.id,
                resource,
                priority,
                resolve,
                reject
            };

            this.queue.enqueue(item, priority);
            this._processQueue();
        });
    }

    /**
     * پخش تلفظ کلمه
     */
    async pronounce(word, options = {}) {
        const resource = new AudioResource({
            text: word,
            type: AudioType.WORD_PRONUNCIATION,
            language: options.language || 'en',
            accent: options.accent || VoiceAccent.US,
            tts: true,
            ...options
        });

        return this.play(resource);
    }

    /**
     * پخش جمله
     */
    async speak(sentence, options = {}) {
        const resource = new AudioResource({
            text: sentence,
            type: AudioType.SENTENCE_AUDIO,
            language: options.language || 'en',
            accent: options.accent || VoiceAccent.US,
            tts: true,
            ...options
        });

        return this.play(resource);
    }

    /**
     * پیش‌بارگذاری فایل صوتی
     */
    async preload(url) {
        if (!url || this.cache.has(url)) return;

        try {
            const player = new AudioPlayer({ autoplay: false });
            await player.load(new AudioResource({ url }));
            this.cache.set(url, player);
        } catch (error) {
            console.warn('Error preloading audio:', error);
        }
    }

    /**
     * توقف پخش
     */
    stop(id = null) {
        if (id && this.players.has(id)) {
            this.players.get(id).stop();
            this.players.delete(id);
        } else if (this.activePlayer) {
            this.activePlayer.stop();
            this.activePlayer = null;
        }

        // پاک‌سازی صف
        this.queue.clear();
    }

    /**
     * توقف موقت
     */
    pause() {
        if (this.activePlayer) {
            this.activePlayer.pause();
        }

        if (this.ttsEngine) {
            this.ttsEngine.pause();
        }
    }

    /**
     * ادامه پخش
     */
    resume() {
        if (this.activePlayer) {
            this.activePlayer.resume();
        }

        if (this.ttsEngine) {
            this.ttsEngine.resume();
        }
    }

    /**
     * تنظیم صدا
     */
    setVolume(volume) {
        this.globalVolume = Math.max(0, Math.min(1, volume));
        
        this.players.forEach(player => {
            player.setVolume(this.isMuted ? 0 : this.globalVolume);
        });
    }

    /**
     * قطع صدا
     */
    setMuted(muted) {
        this.isMuted = muted;
        this.setVolume(this.globalVolume);
    }

    /**
     * دریافت وضعیت پخش
     */
    getState(id = null) {
        if (id && this.players.has(id)) {
            return this.players.get(id).state;
        }
        return this.activePlayer?.state || AudioState.IDLE;
    }

    /**
     * دریافت مدت زمان
     */
    getDuration(id = null) {
        if (id && this.players.has(id)) {
            return this.players.get(id).getDuration();
        }
        return this.activePlayer?.getDuration() || 0;
    }

    /**
     * دریافت زمان فعلی
     */
    getCurrentTime(id = null) {
        if (id && this.players.has(id)) {
            return this.players.get(id).getCurrentTime();
        }
        return this.activePlayer?.getCurrentTime() || 0;
    }

    /**
     * دریافت آمار کش
     */
    getCacheStats() {
        return this.cache.getStats();
    }

    /**
     * دریافت وضعیت صف
     */
    getQueueStatus() {
        return {
            size: this.queue.size(),
            current: this.queue.currentItem,
            queue: this.queue.getQueue()
        };
    }

    /**
     * شروع ضبط صدا
     */
    startRecording(options = {}) {
        this.recorder = new AudioRecorder({
            onDataAvailable: options.onDataAvailable,
            onStop: options.onStop,
            onError: options.onError
        });

        return this.recorder.start();
    }

    /**
     * توقف ضبط
     */
    stopRecording() {
        if (this.recorder) {
            this.recorder.stop();
            this.recorder = null;
        }
    }

    /**
     * پخش صدای ضبط شده
     */
    async playRecording(blob) {
        const url = URL.createObjectURL(blob);
        const resource = new AudioResource({
            url,
            type: AudioType.RECORDING,
            cacheable: false
        });

        const result = await this.play(resource);
        
        // پاک‌سازی URL بعد از پخش
        setTimeout(() => URL.revokeObjectURL(url), 60000);

        return result;
    }

    /**
     * ایجاد visualizer
     */
    createVisualizer(canvas, id = null) {
        const player = id ? this.players.get(id) : this.activePlayer;
        return player?.createVisualizer(canvas) || null;
    }

    /**
     * ثبت listener
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    /**
     * حذف listener
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * پاک‌سازی
     */
    destroy() {
        this.stop();
        this.players.forEach(player => player.destroy());
        this.players.clear();
        this.cache.clear();
        this.queue.clear();
        this.listeners.clear();
        this.activePlayer = null;
        this.ttsEngine = null;
    }

    // ============ Private Methods ============

    _initTTS() {
        if (window.speechSynthesis) {
            this.ttsEngine = new TTSEngine();
        }
    }

    async _playCached(player, config) {
        if (config.volume !== undefined) {
            player.setVolume(config.volume);
        }
        
        return player.play();
    }

    async _processQueue() {
        if (this.queue.processing || this.queue.isEmpty()) return;

        this.queue.processing = true;

        while (!this.queue.isEmpty()) {
            const item = this.queue.dequeue();
            this.queue.currentItem = item;

            try {
                const result = await this.play(item.resource);
                item.resolve(result);
            } catch (error) {
                item.reject(error);
            }
        }

        this.queue.processing = false;
        this.queue.currentItem = null;
    }

    _emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} listener:`, error);
                }
            });
        }
    }
}

// ============ Factory ============
class AudioServiceFactory {
    static create(config = {}) {
        return new AudioService(config);
    }

    static createWithDefaults() {
        return new AudioService({
            maxCacheSize: 50,
            cacheMaxAge: 3600000,
            defaultVolume: 0.8,
            enableQueue: true,
            enableCache: true,
            preloadNext: true
        });
    }

    static createForPronunciation(config = {}) {
        return new AudioService({
            maxCacheSize: 100,
            cacheMaxAge: 7200000, // 2 ساعت
            defaultVolume: 0.9,
            enableQueue: true,
            enableCache: true,
            preloadNext: true,
            ...config
        });
    }
}

// ============ Export ============
export {
    AudioService,
    AudioServiceFactory,
    AudioPlayer,
    AudioRecorder,
    AudioCache,
    AudioQueue,
    AudioVisualizer,
    TTSEngine,
    AudioResource,
    AudioConfig,
    AudioPlaybackResult,
    AudioState,
    AudioType,
    VoiceAccent,
    AudioPriority
};
```
