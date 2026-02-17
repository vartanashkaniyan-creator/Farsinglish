```javascript
// ui/components/audio_player.js
/**
 * Audio Player Component - کامپوننت پخش‌کننده صوتی
 * مسئولیت: نمایش و کنترل پخش فایل‌های صوتی با رابط کاربری تعاملی
 * اصل SRP: فقط مسئول نمایش و کنترل پخش صدا
 * اصل DIP: وابسته به AudioService از طریق اینترفیس
 * اصل OCP: قابل توسعه برای انواع مختلف پلیر و کنترل‌ها
 */

// ============ Types and Enums ============
const PlayerState = {
    IDLE: 'idle',
    LOADING: 'loading',
    PLAYING: 'playing',
    PAUSED: 'paused',
    STOPPED: 'stopped',
    ENDED: 'ended',
    ERROR: 'error'
};

const PlayerSize = {
    SMALL: 'small',
    MEDIUM: 'medium',
    LARGE: 'large',
    FULL: 'full'
};

const PlayerVariant = {
    SIMPLE: 'simple',
    STANDARD: 'standard',
    ADVANCED: 'advanced',
    MINIMAL: 'minimal',
    WAVEFORM: 'waveform'
};

const PlaybackRate = {
    HALF: 0.5,
    NORMAL: 1.0,
    ONE_POINT_TWO_FIVE: 1.25,
    ONE_POINT_FIVE: 1.5,
    DOUBLE: 2.0
};

// ============ DTOs ============
class AudioPlayerConfig {
    constructor(config = {}) {
        // اندازه و ظاهر
        this.size = config.size || PlayerSize.MEDIUM;
        this.variant = config.variant || PlayerVariant.STANDARD;
        
        // ویژگی‌ها
        this.showWaveform = config.showWaveform ?? false;
        this.showVisualizer = config.showVisualizer ?? false;
        this.showVolumeControl = config.showVolumeControl ?? true;
        this.showPlaybackRate = config.showPlaybackRate ?? true;
        this.showProgress = config.showProgress ?? true;
        this.showTime = config.showTime ?? true;
        this.showDownload = config.showDownload ?? false;
        this.showLoop = config.showLoop ?? false;
        this.showTranscript = config.showTranscript ?? false;
        
        // رفتار
        this.autoplay = config.autoplay ?? false;
        this.loop = config.loop ?? false;
        this.preload = config.preload ?? 'metadata';
        this.crossOrigin = config.crossOrigin ?? 'anonymous';
        
        // استایل
        this.theme = config.theme || 'light';
        this.primaryColor = config.primaryColor || '#2196f3';
        this.secondaryColor = config.secondaryColor || '#f50057';
        this.backgroundColor = config.backgroundColor || '#ffffff';
        this.textColor = config.textColor || '#2c3e50';
        
        // RTL
        this.rtl = config.rtl ?? true;
        
        // رویدادها
        this.onPlay = config.onPlay || null;
        this.onPause = config.onPause || null;
        this.onStop = config.onStop || null;
        this.onEnded = config.onEnded || null;
        this.onTimeUpdate = config.onTimeUpdate || null;
        this.onVolumeChange = config.onVolumeChange || null;
        this.onError = config.onError || null;
        
        // کلاس و استایل سفارشی
        this.className = config.className || '';
        this.style = config.style || {};
    }
    
    merge(newConfig) {
        return new AudioPlayerConfig({
            ...this,
            ...newConfig
        });
    }
}

class AudioTrack {
    constructor(data = {}) {
        this.id = data.id || `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.url = data.url;
        this.title = data.title || 'صوت بدون عنوان';
        this.artist = data.artist || '';
        this.album = data.album || '';
        this.cover = data.cover || '';
        this.duration = data.duration || 0;
        this.format = data.format || 'mp3';
        this.size = data.size || 0;
        this.transcript = data.transcript || '';
        this.translation = data.translation || '';
        this.metadata = data.metadata || {};
    }
}

class Playlist {
    constructor(data = {}) {
        this.id = data.id || `playlist_${Date.now()}`;
        this.name = data.name || 'پلی‌لیست';
        this.tracks = data.tracks || [];
        this.currentIndex = data.currentIndex || 0;
        this.shuffle = data.shuffle || false;
        this.repeat = data.repeat || 'none'; // none, one, all
    }
    
    get currentTrack() {
        return this.tracks[this.currentIndex];
    }
    
    get nextTrack() {
        if (this.tracks.length === 0) return null;
        
        if (this.shuffle) {
            let nextIndex;
            do {
                nextIndex = Math.floor(Math.random() * this.tracks.length);
            } while (nextIndex === this.currentIndex && this.tracks.length > 1);
            return this.tracks[nextIndex];
        }
        
        const nextIndex = (this.currentIndex + 1) % this.tracks.length;
        return this.tracks[nextIndex];
    }
    
    get prevTrack() {
        if (this.tracks.length === 0) return null;
        
        if (this.shuffle) {
            return this.nextTrack; // در حالت shuffle، قبلی همان بعدی است
        }
        
        const prevIndex = this.currentIndex - 1;
        if (prevIndex < 0) {
            return this.tracks[this.tracks.length - 1];
        }
        return this.tracks[prevIndex];
    }
    
    addTrack(track) {
        this.tracks.push(track);
        return this;
    }
    
    removeTrack(trackId) {
        const index = this.tracks.findIndex(t => t.id === trackId);
        if (index !== -1) {
            this.tracks.splice(index, 1);
            if (this.currentIndex >= this.tracks.length) {
                this.currentIndex = Math.max(0, this.tracks.length - 1);
            }
        }
        return this;
    }
    
    next() {
        if (this.tracks.length === 0) return null;
        
        if (this.repeat === 'one') {
            return this.currentTrack;
        }
        
        const next = this.nextTrack;
        if (next) {
            this.currentIndex = this.tracks.findIndex(t => t.id === next.id);
        }
        
        return next;
    }
    
    prev() {
        if (this.tracks.length === 0) return null;
        
        if (this.repeat === 'one') {
            return this.currentTrack;
        }
        
        const prev = this.prevTrack;
        if (prev) {
            this.currentIndex = this.tracks.findIndex(t => t.id === prev.id);
        }
        
        return prev;
    }
    
    shuffle() {
        this.shuffle = !this.shuffle;
        return this;
    }
    
    setRepeat(mode) {
        this.repeat = mode;
        return this;
    }
}

// ============ Waveform Visualizer ============
class WaveformVisualizer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.options = {
            width: options.width || 300,
            height: options.height || 80,
            barWidth: options.barWidth || 4,
            barGap: options.barGap || 2,
            barColor: options.barColor || '#2196f3',
            playedColor: options.playedColor || '#f50057',
            backgroundColor: options.backgroundColor || 'transparent',
            ...options
        };
        
        this.data = new Uint8Array(100).fill(0);
        this.playedBars = 0;
        this.animationFrame = null;
        this.isActive = false;
        
        this._resize();
    }
    
    setData(data) {
        this.data = data;
        this._draw();
    }
    
    setPlayedBars(count) {
        this.playedBars = count;
        this._draw();
    }
    
    start() {
        this.isActive = true;
        this._animate();
    }
    
    stop() {
        this.isActive = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }
    
    resize() {
        this._resize();
        this._draw();
    }
    
    destroy() {
        this.stop();
        this.ctx = null;
    }
    
    _resize() {
        const container = this.canvas.parentElement;
        if (container) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = this.options.height;
        }
    }
    
    _animate() {
        if (!this.isActive) return;
        
        this._draw();
        this.animationFrame = requestAnimationFrame(() => this._animate());
    }
    
    _draw() {
        if (!this.ctx || !this.canvas) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.ctx.clearRect(0, 0, width, height);
        
        if (this.options.backgroundColor !== 'transparent') {
            this.ctx.fillStyle = this.options.backgroundColor;
            this.ctx.fillRect(0, 0, width, height);
        }
        
        const barCount = Math.floor(width / (this.options.barWidth + this.options.barGap));
        const step = Math.floor(this.data.length / barCount);
        
        for (let i = 0; i < barCount; i++) {
            const dataIndex = i * step;
            const value = this.data[dataIndex] || 0;
            const barHeight = (value / 255) * height;
            
            const x = i * (this.options.barWidth + this.options.barGap);
            const y = (height - barHeight) / 2;
            
            if (i < this.playedBars) {
                this.ctx.fillStyle = this.options.playedColor;
            } else {
                this.ctx.fillStyle = this.options.barColor;
            }
            
            this.ctx.fillRect(x, y, this.options.barWidth, barHeight);
        }
    }
}

// ============ Progress Bar ============
class ProgressBar {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            height: options.height || 4,
            backgroundColor: options.backgroundColor || '#e0e0e0',
            progressColor: options.progressColor || '#2196f3',
            handleColor: options.handleColor || '#f50057',
            showHandle: options.showHandle ?? true,
            ...options
        };
        
        this.element = null;
        this.progressBar = null;
        progressHandle = null;
        this.value = 0;
        this.isDragging = false;
        this.onSeek = options.onSeek || null;
        
        this._create();
        this._setupEvents();
    }
    
    setValue(value) {
        this.value = Math.max(0, Math.min(100, value));
        this.progressBar.style.width = `${this.value}%`;
        
        if (this.options.showHandle) {
            this.progressHandle.style.left = `${this.value}%`;
        }
    }
    
    getValue() {
        return this.value;
    }
    
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
    
    _create() {
        this.element = document.createElement('div');
        this.element.className = 'audio-progress-bar';
        this.element.style.cssText = `
            position: relative;
            width: 100%;
            height: ${this.options.height}px;
            background: ${this.options.backgroundColor};
            border-radius: ${this.options.height / 2}px;
            cursor: pointer;
        `;
        
        this.progressBar = document.createElement('div');
        this.progressBar.className = 'audio-progress-fill';
        this.progressBar.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 0%;
            background: ${this.options.progressColor};
            border-radius: ${this.options.height / 2}px;
            transition: width 0.1s linear;
        `;
        this.element.appendChild(this.progressBar);
        
        if (this.options.showHandle) {
            this.progressHandle = document.createElement('div');
            this.progressHandle.className = 'audio-progress-handle';
            this.progressHandle.style.cssText = `
                position: absolute;
                top: 50%;
                left: 0%;
                width: 16px;
                height: 16px;
                background: ${this.options.handleColor};
                border-radius: 50%;
                transform: translate(-50%, -50%);
                cursor: grab;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                transition: left 0.1s linear;
            `;
            this.element.appendChild(this.progressHandle);
        }
        
        this.container.appendChild(this.element);
    }
    
    _setupEvents() {
        this.element.addEventListener('mousedown', (e) => this._handleMouseDown(e));
        this.element.addEventListener('touchstart', (e) => this._handleMouseDown(e));
        
        document.addEventListener('mousemove', (e) => this._handleMouseMove(e));
        document.addEventListener('touchmove', (e) => this._handleMouseMove(e));
        
        document.addEventListener('mouseup', () => this._handleMouseUp());
        document.addEventListener('touchend', () => this._handleMouseUp());
    }
    
    _handleMouseDown(e) {
        e.preventDefault();
        this.isDragging = true;
        this._updateValueFromEvent(e);
        
        if (this.progressHandle) {
            this.progressHandle.style.cursor = 'grabbing';
        }
    }
    
    _handleMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        this._updateValueFromEvent(e);
    }
    
    _handleMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            if (this.progressHandle) {
                this.progressHandle.style.cursor = 'grab';
            }
        }
    }
    
    _updateValueFromEvent(e) {
        const rect = this.element.getBoundingClientRect();
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        
        let x = clientX - rect.left;
        x = Math.max(0, Math.min(rect.width, x));
        
        const percentage = (x / rect.width) * 100;
        this.setValue(percentage);
        
        if (this.onSeek) {
            this.onSeek(percentage);
        }
    }
}

// ============ Volume Control ============
class VolumeControl {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            initialVolume: options.initialVolume || 0.8,
            ...options
        };
        
        this.element = null;
        this.slider = null;
        this.icon = null;
        this.isMuted = false;
        this.lastVolume = this.options.initialVolume;
        this.onVolumeChange = options.onVolumeChange || null;
        this.onMuteToggle = options.onMuteToggle || null;
        
        this._create();
        this._setupEvents();
    }
    
    setVolume(volume) {
        volume = Math.max(0, Math.min(1, volume));
        this.slider.value = volume * 100;
        this.lastVolume = volume;
        this._updateIcon();
        
        if (!this.isMuted && this.onVolumeChange) {
            this.onVolumeChange(volume);
        }
    }
    
    getVolume() {
        return this.isMuted ? 0 : this.lastVolume;
    }
    
    setMuted(muted) {
        this.isMuted = muted;
        this._updateIcon();
        
        if (this.onMuteToggle) {
            this.onMuteToggle(muted);
        }
        
        if (this.onVolumeChange) {
            this.onVolumeChange(this.getVolume());
        }
    }
    
    toggleMute() {
        this.setMuted(!this.isMuted);
    }
    
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
    
    _create() {
        this.element = document.createElement('div');
        this.element.className = 'audio-volume-control';
        this.element.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        
        // Volume icon
        this.icon = document.createElement('button');
        this.icon.className = 'audio-volume-icon';
        this.icon.setAttribute('aria-label', 'کنترل صدا');
        this.icon.style.cssText = `
            width: 32px;
            height: 32px;
            border: none;
            background: transparent;
            font-size: 1.2rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        this._updateIcon();
        this.element.appendChild(this.icon);
        
        // Volume slider
        this.slider = document.createElement('input');
        this.slider.type = 'range';
        this.slider.className = 'audio-volume-slider';
        this.slider.min = 0;
        this.slider.max = 100;
        this.slider.value = this.options.initialVolume * 100;
        this.slider.setAttribute('aria-label', 'تنظیم صدا');
        this.slider.style.cssText = `
            width: 80px;
            height: 4px;
            -webkit-appearance: none;
            background: ${this.isMuted ? '#ccc' : '#2196f3'};
            border-radius: 2px;
            outline: none;
        `;
        this.element.appendChild(this.slider);
        
        this.container.appendChild(this.element);
    }
    
    _setupEvents() {
        this.icon.addEventListener('click', () => this.toggleMute());
        
        this.slider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            this.lastVolume = volume;
            this._updateIcon();
            
            if (!this.isMuted && this.onVolumeChange) {
                this.onVolumeChange(volume);
            }
        });
        
        this.slider.addEventListener('change', (e) => {
            if (this.isMuted) {
                this.isMuted = false;
                this._updateIcon();
            }
        });
    }
    
    _updateIcon() {
        if (!this.icon) return;
        
        if (this.isMuted || this.lastVolume === 0) {
            this.icon.innerHTML = '🔇';
            this.icon.setAttribute('aria-label', 'صدا قطع است');
        } else if (this.lastVolume < 0.3) {
            this.icon.innerHTML = '🔈';
            this.icon.setAttribute('aria-label', 'صدای کم');
        } else if (this.lastVolume < 0.7) {
            this.icon.innerHTML = '🔉';
            this.icon.setAttribute('aria-label', 'صدای متوسط');
        } else {
            this.icon.innerHTML = '🔊';
            this.icon.setAttribute('aria-label', 'صدای زیاد');
        }
        
        this.slider.style.background = this.isMuted ? '#ccc' : '#2196f3';
    }
}

// ============ Time Display ============
class TimeDisplay {
    constructor(container) {
        this.container = container;
        this.element = null;
        this.currentEl = null;
        this.durationEl = null;
        
        this._create();
    }
    
    setTime(current, duration) {
        if (this.currentEl) {
            this.currentEl.textContent = this._formatTime(current);
        }
        if (this.durationEl && duration) {
            this.durationEl.textContent = this._formatTime(duration);
        }
    }
    
    setCurrentTime(seconds) {
        if (this.currentEl) {
            this.currentEl.textContent = this._formatTime(seconds);
        }
    }
    
    setDuration(seconds) {
        if (this.durationEl) {
            this.durationEl.textContent = this._formatTime(seconds);
        }
    }
    
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
    
    _create() {
        this.element = document.createElement('div');
        this.element.className = 'audio-time-display';
        this.element.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 0.9rem;
            color: inherit;
        `;
        
        this.currentEl = document.createElement('span');
        this.currentEl.className = 'audio-current-time';
        this.currentEl.textContent = '0:00';
        this.element.appendChild(this.currentEl);
        
        const separator = document.createElement('span');
        separator.textContent = '/';
        separator.style.margin = '0 4px';
        this.element.appendChild(separator);
        
        this.durationEl = document.createElement('span');
        this.durationEl.className = 'audio-duration';
        this.durationEl.textContent = '0:00';
        this.element.appendChild(this.durationEl);
        
        this.container.appendChild(this.element);
    }
    
    _formatTime(seconds) {
        if (isNaN(seconds) || seconds === Infinity) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

// ============ Playback Rate Control ============
class PlaybackRateControl {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            rates: options.rates || [0.5, 1.0, 1.25, 1.5, 2.0],
            initialRate: options.initialRate || 1.0,
            ...options
        };
        
        this.element = null;
        this.button = null;
        this.menu = null;
        this.currentRate = this.options.initialRate;
        this.onRateChange = options.onRateChange || null;
        
        this._create();
        this._setupEvents();
    }
    
    setRate(rate) {
        if (this.options.rates.includes(rate)) {
            this.currentRate = rate;
            this.button.textContent = `${rate}x`;
            
            if (this.onRateChange) {
                this.onRateChange(rate);
            }
        }
    }
    
    getRate() {
        return this.currentRate;
    }
    
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
    
    _create() {
        this.element = document.createElement('div');
        this.element.className = 'audio-playback-rate';
        this.element.style.cssText = `
            position: relative;
            display: inline-block;
        `;
        
        this.button = document.createElement('button');
        this.button.className = 'audio-rate-button';
        this.button.textContent = `${this.currentRate}x`;
        this.button.setAttribute('aria-label', 'سرعت پخش');
        this.button.style.cssText = `
            padding: 4px 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: transparent;
            cursor: pointer;
            font-size: 0.9rem;
            color: inherit;
        `;
        this.element.appendChild(this.button);
        
        this.menu = document.createElement('div');
        this.menu.className = 'audio-rate-menu';
        this.menu.style.cssText = `
            position: absolute;
            bottom: 100%;
            left: 0;
            background: white;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            display: none;
            z-index: 1000;
            min-width: 80px;
        `;
        
        this.options.rates.forEach(rate => {
            const item = document.createElement('div');
            item.className = 'audio-rate-item';
            item.textContent = `${rate}x`;
            item.setAttribute('data-rate', rate);
            item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                transition: background 0.2s;
            `;
            item.addEventListener('mouseenter', () => {
                item.style.background = '#f5f5f5';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = 'transparent';
            });
            this.menu.appendChild(item);
        });
        
        this.element.appendChild(this.menu);
        this.container.appendChild(this.element);
    }
    
    _setupEvents() {
        this.button.addEventListener('click', () => {
            this.menu.style.display = this.menu.style.display === 'none' ? 'block' : 'none';
        });
        
        this.menu.addEventListener('click', (e) => {
            const rate = parseFloat(e.target.getAttribute('data-rate'));
            if (!isNaN(rate)) {
                this.setRate(rate);
                this.menu.style.display = 'none';
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!this.element.contains(e.target)) {
                this.menu.style.display = 'none';
            }
        });
    }
}

// ============ Main Audio Player Component ============
class AudioPlayer {
    constructor(container, audioService, config = {}) {
        if (!container) {
            throw new Error('AudioPlayer: Container element is required');
        }
        
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        
        if (!this.container) {
            throw new Error('AudioPlayer: Container element not found');
        }
        
        this.audioService = audioService;
        this.config = new AudioPlayerConfig(config);
        this.state = PlayerState.IDLE;
        this.currentTrack = null;
        this.playlist = null;
        this.playerId = null;
        
        // عناصر DOM
        this.element = null;
        this.playBtn = null;
        this.pauseBtn = null;
        this.stopBtn = null;
        this.prevBtn = null;
        this.nextBtn = null;
        this.loopBtn = null;
        this.shuffleBtn = null;
        this.titleEl = null;
        this.artistEl = null;
        this.coverEl = null;
        
        // کامپوننت‌ها
        this.progressBar = null;
        this.volumeControl = null;
        this.timeDisplay = null;
        this.playbackRateControl = null;
        this.waveform = null;
        
        // وضعیت
        this.duration = 0;
        this.currentTime = 0;
        this.volume = this.config.volume || 0.8;
        this.playbackRate = 1.0;
        this.loop = this.config.loop;
        
        this._create();
        this._setupEventListeners();
    }
    
    /**
     * پخش یک فایل صوتی
     */
    async play(track) {
        try {
            if (typeof track === 'string') {
                track = new AudioTrack({ url: track });
            }
            
            this.currentTrack = track;
            this._updateTrackInfo();
            
            this.setState(PlayerState.LOADING);
            
            this.playerId = await this.audioService.play(track.url, {
                volume: this.volume,
                playbackRate: this.playbackRate,
                loop: this.loop
            });
            
            this.setState(PlayerState.PLAYING);
            
        } catch (error) {
            this.setState(PlayerState.ERROR);
            console.error('Error playing audio:', error);
            if (this.config.onError) {
                this.config.onError(error);
            }
        }
    }
    
    /**
     * پخش پلی‌لیست
     */
    async playPlaylist(playlist) {
        this.playlist = playlist instanceof Playlist ? playlist : new Playlist(playlist);
        
        if (this.playlist.tracks.length > 0) {
            await this.play(this.playlist.currentTrack);
        }
    }
    
    /**
     * توقف موقت
     */
    pause() {
        if (this.playerId) {
            this.audioService.pause(this.playerId);
            this.setState(PlayerState.PAUSED);
        }
    }
    
    /**
     * ادامه پخش
     */
    resume() {
        if (this.playerId) {
            this.audioService.resume(this.playerId);
            this.setState(PlayerState.PLAYING);
        }
    }
    
    /**
     * توقف کامل
     */
    stop() {
        if (this.playerId) {
            this.audioService.stop(this.playerId);
            this.setState(PlayerState.STOPPED);
            this.currentTime = 0;
            this._updateProgress();
        }
    }
    
    /**
     * رفتن به زمان مشخص
     */
    seek(percentage) {
        if (this.playerId && this.duration) {
            const time = (percentage / 100) * this.duration;
            this.audioService.seek(this.playerId, time);
        }
    }
    
    /**
     * تنظیم صدا
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        
        if (this.playerId) {
            this.audioService.setVolume(this.playerId, this.volume);
        }
        
        if (this.volumeControl) {
            this.volumeControl.setVolume(this.volume);
        }
        
        if (this.config.onVolumeChange) {
            this.config.onVolumeChange(this.volume);
        }
    }
    
    /**
     * قطع صدا
     */
    setMuted(muted) {
        if (this.playerId) {
            this.audioService.setMuted(this.playerId, muted);
        }
        
        if (this.volumeControl) {
            this.volumeControl.setMuted(muted);
        }
    }
    
    /**
     * تنظیم سرعت پخش
     */
    setPlaybackRate(rate) {
        this.playbackRate = rate;
        
        if (this.playerId) {
            this.audioService.setPlaybackRate(this.playerId, rate);
        }
    }
    
    /**
     * رفتن به آهنگ بعدی
     */
    async next() {
        if (this.playlist) {
            const nextTrack = this.playlist.next();
            if (nextTrack) {
                await this.play(nextTrack);
            }
        }
    }
    
    /**
     * رفتن به آهنگ قبلی
     */
    async previous() {
        if (this.playlist) {
            const prevTrack = this.playlist.prev();
            if (prevTrack) {
                await this.play(prevTrack);
            }
        }
    }
    
    /**
     * تنظیم حالت تکرار
     */
    setLoop(loop) {
        this.loop = loop;
        
        if (this.loopBtn) {
            this.loopBtn.classList.toggle('active', loop);
            this.loopBtn.setAttribute('aria-pressed', loop);
        }
        
        if (this.playerId) {
            this.audioService.setLoop(this.playerId, loop);
        }
    }
    
    /**
     * تنظیم حالت تصادفی
     */
    setShuffle(shuffle) {
        if (this.playlist) {
            this.playlist.shuffle = shuffle;
            
            if (this.shuffleBtn) {
                this.shuffleBtn.classList.toggle('active', shuffle);
                this.shuffleBtn.setAttribute('aria-pressed', shuffle);
            }
        }
    }
    
    /**
     * دریافت وضعیت فعلی
     */
    getState() {
        return {
            state: this.state,
            currentTrack: this.currentTrack,
            currentTime: this.currentTime,
            duration: this.duration,
            volume: this.volume,
            playbackRate: this.playbackRate,
            loop: this.loop
        };
    }
    
    /**
     * پاک‌سازی کامپوننت
     */
    destroy() {
        this.stop();
        
        if (this.progressBar) {
            this.progressBar.destroy();
        }
        
        if (this.volumeControl) {
            this.volumeControl.destroy();
        }
        
        if (this.timeDisplay) {
            this.timeDisplay.destroy();
        }
        
        if (this.playbackRateControl) {
            this.playbackRateControl.destroy();
        }
        
        if (this.waveform) {
            this.waveform.destroy();
        }
        
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
    
    // ============ Private Methods ============
    
    _create() {
        this.element = document.createElement('div');
        this.element.className = `audio-player audio-player-${this.config.size} audio-player-${this.config.variant}`;
        this.element.setAttribute('dir', this.config.rtl ? 'rtl' : 'ltr');
        
        // اعمال استایل
        this.element.style.cssText = `
            background: ${this.config.backgroundColor};
            color: ${this.config.textColor};
            border-radius: 8px;
            padding: 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        `;
        
        if (this.config.className) {
            this.element.classList.add(this.config.className);
        }
        
        // ایجاد ساختار بر اساس variant
        switch (this.config.variant) {
            case PlayerVariant.SIMPLE:
                this._createSimpleLayout();
                break;
            case PlayerVariant.MINIMAL:
                this._createMinimalLayout();
                break;
            case PlayerVariant.ADVANCED:
                this._createAdvancedLayout();
                break;
            case PlayerVariant.WAVEFORM:
                this._createWaveformLayout();
                break;
            default:
                this._createStandardLayout();
        }
        
        this.container.appendChild(this.element);
    }
    
    _createStandardLayout() {
        // Cover and info
        const infoSection = document.createElement('div');
        infoSection.className = 'player-info-section';
        infoSection.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
        `;
        
        this.coverEl = document.createElement('img');
        this.coverEl.className = 'player-cover';
        this.coverEl.style.cssText = `
            width: 48px;
            height: 48px;
            border-radius: 4px;
            object-fit: cover;
        `;
        this.coverEl.src = this.currentTrack?.cover || 'data:image/svg+xml,...';
        infoSection.appendChild(this.coverEl);
        
        const textInfo = document.createElement('div');
        textInfo.className = 'player-text-info';
        textInfo.style.cssText = `
            flex: 1;
            overflow: hidden;
        `;
        
        this.titleEl = document.createElement('div');
        this.titleEl.className = 'player-title';
        this.titleEl.style.cssText = `
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        this.titleEl.textContent = this.currentTrack?.title || 'آهنگی انتخاب نشده';
        textInfo.appendChild(this.titleEl);
        
        this.artistEl = document.createElement('div');
        this.artistEl.className = 'player-artist';
        this.artistEl.style.cssText = `
            font-size: 0.9rem;
            opacity: 0.8;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        this.artistEl.textContent = this.currentTrack?.artist || '';
        textInfo.appendChild(this.artistEl);
        
        infoSection.appendChild(textInfo);
        this.element.appendChild(infoSection);
        
        // Progress section
        const progressSection = document.createElement('div');
        progressSection.className = 'player-progress-section';
        progressSection.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
        `;
        
        // Time display
        const timeContainer = document.createElement('div');
        timeContainer.style.minWidth = '80px';
        this.timeDisplay = new TimeDisplay(timeContainer);
        progressSection.appendChild(timeContainer);
        
        // Progress bar
        const progressContainer = document.createElement('div');
        progressContainer.style.flex = '1';
        this.progressBar = new ProgressBar(progressContainer, {
            height: 4,
            progressColor: this.config.primaryColor,
            handleColor: this.config.secondaryColor,
            onSeek: (percentage) => this.seek(percentage)
        });
        progressSection.appendChild(progressContainer);
        
        this.element.appendChild(progressSection);
        
        // Controls section
        const controlsSection = document.createElement('div');
        controlsSection.className = 'player-controls-section';
        controlsSection.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-bottom: 16px;
        `;
        
        this._createControlButtons(controlsSection);
        this.element.appendChild(controlsSection);
        
        // Volume section
        if (this.config.showVolumeControl) {
            const volumeSection = document.createElement('div');
            volumeSection.className = 'player-volume-section';
            volumeSection.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: flex-end;
            `;
            
            this.volumeControl = new VolumeControl(volumeSection, {
                initialVolume: this.volume,
                onVolumeChange: (volume) => this.setVolume(volume),
                onMuteToggle: (muted) => this.setMuted(muted)
            });
            
            this.element.appendChild(volumeSection);
        }
    }
    
    _createSimpleLayout() {
        // فقط دکمه‌های اصلی و پیشرفت
        const controls = document.createElement('div');
        controls.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        `;
        
        this._createControlButtons(controls);
        this.element.appendChild(controls);
        
        const progressContainer = document.createElement('div');
        progressContainer.style.flex = '1';
        this.progressBar = new ProgressBar(progressContainer, {
            height: 4,
            progressColor: this.config.primaryColor,
            showHandle: false,
            onSeek: (percentage) => this.seek(percentage)
        });
        this.element.appendChild(progressContainer);
    }
    
    _createMinimalLayout() {
        // فقط دکمه پخش و پیشرفت
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        
        this.playBtn = this._createButton('▶️', 'پخش');
        this.playBtn.addEventListener('click', () => this.resume());
        container.appendChild(this.playBtn);
        
        this.pauseBtn = this._createButton('⏸️', 'توقف موقت');
        this.pauseBtn.style.display = 'none';
        this.pauseBtn.addEventListener('click', () => this.pause());
        container.appendChild(this.pauseBtn);
        
        const progressContainer = document.createElement('div');
        progressContainer.style.flex = '1';
        this.progressBar = new ProgressBar(progressContainer, {
            height: 3,
            progressColor: this.config.primaryColor,
            showHandle: false,
            onSeek: (percentage) => this.seek(percentage)
        });
        container.appendChild(progressContainer);
        
        this.element.appendChild(container);
    }
    
    _createAdvancedLayout() {
        // Layout کامل با waveform و تمام کنترل‌ها
        this._createStandardLayout();
        
        // اضافه کردن waveform
        if (this.config.showWaveform) {
            const waveformContainer = document.createElement('div');
            waveformContainer.style.cssText = `
                margin-top: 16px;
                height: 60px;
            `;
            
            const canvas = document.createElement('canvas');
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            waveformContainer.appendChild(canvas);
            
            this.element.appendChild(waveformContainer);
            
            this.waveform = new WaveformVisualizer(canvas, {
                height: 60,
                barColor: this.config.primaryColor + '40',
                playedColor: this.config.primaryColor
            });
            
            // اتصال به audio service برای دریافت داده
            if (this.playerId) {
                const visualizer = this.audioService.createVisualizer(canvas, this.playerId);
                if (visualizer) {
                    visualizer.start();
                }
            }
        }
        
        // اضافه کردن کنترل سرعت
        if (this.config.showPlaybackRate) {
            const rateContainer = document.createElement('div');
            rateContainer.style.cssText = `
                margin-top: 8px;
                display: flex;
                justify-content: flex-end;
            `;
            
            this.playbackRateControl = new PlaybackRateControl(rateContainer, {
                initialRate: this.playbackRate,
                onRateChange: (rate) => this.setPlaybackRate(rate)
            });
            
            this.element.appendChild(rateContainer);
        }
    }
    
    _createWaveformLayout() {
        // مشابه advanced اما با waveform برجسته‌تر
        this._createAdvancedLayout();
        
        const waveformContainer = this.element.querySelector('canvas')?.parentElement;
        if (waveformContainer) {
            waveformContainer.style.height = '100px';
            waveformContainer.style.marginBottom = '16px';
        }
    }
    
    _createControlButtons(container) {
        // Previous button
        if (this.playlist && this.playlist.tracks.length > 1) {
            this.prevBtn = this._createButton('⏮️', 'قبلی');
            this.prevBtn.addEventListener('click', () => this.previous());
            container.appendChild(this.prevBtn);
        }
        
        // Play/Pause buttons
        this.playBtn = this._createButton('▶️', 'پخش');
        this.playBtn.addEventListener('click', () => this.resume());
        container.appendChild(this.playBtn);
        
        this.pauseBtn = this._createButton('⏸️', 'توقف موقت');
        this.pauseBtn.style.display = 'none';
        this.pauseBtn.addEventListener('click', () => this.pause());
        container.appendChild(this.pauseBtn);
        
        // Stop button
        this.stopBtn = this._createButton('⏹️', 'توقف');
        this.stopBtn.addEventListener('click', () => this.stop());
        container.appendChild(this.stopBtn);
        
        // Next button
        if (this.playlist && this.playlist.tracks.length > 1) {
            this.nextBtn = this._createButton('⏭️', 'بعدی');
            this.nextBtn.addEventListener('click', () => this.next());
            container.appendChild(this.nextBtn);
        }
        
        // Loop button
        if (this.config.showLoop) {
            this.loopBtn = this._createButton('🔁', 'تکرار');
            this.loopBtn.addEventListener('click', () => this.setLoop(!this.loop));
            container.appendChild(this.loopBtn);
        }
        
        // Shuffle button
        if (this.playlist && this.config.showLoop) {
            this.shuffleBtn = this._createButton('🔀', 'تصادفی');
            this.shuffleBtn.addEventListener('click', () => this.setShuffle(!this.playlist.shuffle));
            container.appendChild(this.shuffleBtn);
        }
    }
    
    _createButton(text, label) {
        const btn = document.createElement('button');
        btn.className = 'audio-player-btn';
        btn.innerHTML = text;
        btn.setAttribute('aria-label', label);
        btn.style.cssText = `
            width: 40px;
            height: 40px;
            border: none;
            border-radius: 50%;
            background: transparent;
            color: inherit;
            font-size: 1.2rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        `;
        
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'rgba(0,0,0,0.05)';
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'transparent';
        });
        
        return btn;
    }
    
    _setupEventListeners() {
        // Event listeners برای audio service
        this.audioService.on('timeupdate', (data) => {
            if (data.id === this.playerId) {
                this.currentTime = data.currentTime;
                this.duration = data.duration;
                
                if (this.timeDisplay) {
                    this.timeDisplay.setTime(data.currentTime, data.duration);
                }
                
                if (this.progressBar && this.duration) {
                    const percentage = (this.currentTime / this.duration) * 100;
                    this.progressBar.setValue(percentage);
                }
                
                if (this.config.onTimeUpdate) {
                    this.config.onTimeUpdate(data.currentTime, data.duration);
                }
            }
        });
        
        this.audioService.on('ended', (data) => {
            if (data.id === this.playerId) {
                if (this.playlist) {
                    this.next();
                } else {
                    this.setState(PlayerState.ENDED);
                    this._updateButtons();
                    
                    if (this.config.onEnded) {
                        this.config.onEnded();
                    }
                }
            }
        });
        
        this.audioService.on('stateChange', (data) => {
            if (data.id === this.playerId) {
                this.setState(data.state);
            }
        });
    }
    
    _updateTrackInfo() {
        if (this.titleEl) {
            this.titleEl.textContent = this.currentTrack?.title || 'آهنگی انتخاب نشده';
        }
        
        if (this.artistEl) {
            this.artistEl.textContent = this.currentTrack?.artist || '';
        }
        
        if (this.coverEl && this.currentTrack?.cover) {
            this.coverEl.src = this.currentTrack.cover;
        }
        
        if (this.timeDisplay && this.duration) {
            this.timeDisplay.setDuration(this.duration);
        }
    }
    
    _updateProgress() {
        if (this.progressBar && this.duration) {
            const percentage = (this.currentTime / this.duration) * 100;
            this.progressBar.setValue(percentage);
        }
        
        if (this.timeDisplay) {
            this.timeDisplay.setCurrentTime(this.currentTime);
        }
    }
    
    _updateButtons() {
        const isPlaying = this.state === PlayerState.PLAYING;
        
        if (this.playBtn) {
            this.playBtn.style.display = isPlaying ? 'none' : 'flex';
        }
        
        if (this.pauseBtn) {
            this.pauseBtn.style.display = isPlaying ? 'flex' : 'none';
        }
    }
    
    setState(newState) {
        this.state = newState;
        this.element.setAttribute('data-player-state', newState);
        this._updateButtons();
    }
}

// ============ Styles ============
const audioPlayerStyles = `
.audio-player {
    transition: all 0.3s ease;
}

.audio-player-btn:hover {
    transform: scale(1.1);
}

.audio-player-btn:active {
    transform: scale(0.95);
}

.audio-player-btn.active {
    background: rgba(33, 150, 243, 0.1);
    color: #2196f3;
}

/* RTL Support */
.audio-player[dir="rtl"] .player-info-section {
    flex-direction: row-reverse;
}

.audio-player[dir="rtl"] .player-progress-section {
    flex-direction: row-reverse;
}

.audio-player[dir="rtl"] .audio-volume-control {
    flex-direction: row-reverse;
}

/* Volume Slider Styling */
.audio-volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #2196f3;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.audio-volume-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: none;
    border-radius: 50%;
    background: #2196f3;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

/* Playback Rate Menu */
.audio-rate-menu {
    animation: fadeIn 0.2s ease;
}

.audio-rate-item:hover {
    background: #f5f5f5;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(5px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Sizes */
.audio-player-small {
    padding: 8px;
    font-size: 0.9rem;
}

.audio-player-small .audio-player-btn {
    width: 32px;
    height: 32px;
    font-size: 1rem;
}

.audio-player-large {
    padding: 24px;
    font-size: 1.1rem;
}

.audio-player-large .audio-player-btn {
    width: 48px;
    height: 48px;
    font-size: 1.4rem;
}

.audio-player-full {
    width: 100%;
    max-width: 100%;
    border-radius: 0;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
    .audio-player {
        background: #2d2d2d;
        color: #e0e0e0;
    }
    
    .audio-rate-menu {
        background: #3d3d3d;
        color: #e0e0e0;
    }
    
    .audio-rate-item:hover {
        background: #4d4d4d;
    }
    
    .audio-player-btn:hover {
        background: rgba(255,255,255,0.1);
    }
}

/* Responsive */
@media (max-width: 768px) {
    .audio-player-advanced .player-controls-section {
        flex-wrap: wrap;
    }
    
    .audio-player-advanced .audio-volume-control {
        width: 100%;
        justify-content: center;
    }
    
    .player-progress-section {
        flex-direction: column;
        align-items: stretch;
    }
    
    .time-display {
        text-align: center;
    }
}
`;

// اضافه کردن استایل‌ها
if (typeof document !== 'undefined') {
    const styleId = 'audio-player-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = audioPlayerStyles;
        document.head.appendChild(style);
    }
}

// ============ Export ============
export {
    AudioPlayer,
    AudioTrack,
    Playlist,
    AudioPlayerConfig,
    PlayerState,
    PlayerSize,
    PlayerVariant,
    PlaybackRate,
    WaveformVisualizer,
    ProgressBar,
    VolumeControl,
    TimeDisplay,
    PlaybackRateControl
};
```
