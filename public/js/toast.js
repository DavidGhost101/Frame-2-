/**
 * Rent A Room Soweto - Centralized Global Toast & Notification System
 * Production-ready, accessible, deduplicated notifications with full error-state mapping.
 */
(function (global) {
  'use strict';

  // Supported Toast Types & States
  const TOAST_TYPES = {
    SUCCESS: {
      key: 'success',
      icon: '<svg class="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
      bg: 'bg-slate-900 border-emerald-500/50 text-white shadow-emerald-950/40',
      badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      label: 'Success',
      duration: 4000
    },
    VALIDATION_ERROR: {
      key: 'validation',
      icon: '<svg class="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
      bg: 'bg-slate-900 border-amber-500/50 text-white shadow-amber-950/40',
      badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      label: 'Validation',
      duration: 6000
    },
    AUTHENTICATION_ERROR: {
      key: 'auth',
      icon: '<svg class="w-5 h-5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>',
      bg: 'bg-slate-900 border-indigo-500/50 text-white shadow-indigo-950/40',
      badgeBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      label: 'Authentication',
      duration: 6000
    },
    AUTHORIZATION_ERROR: {
      key: 'forbidden',
      icon: '<svg class="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>',
      bg: 'bg-slate-900 border-rose-500/50 text-white shadow-rose-950/40',
      badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      label: 'Access Denied',
      duration: 6500
    },
    NETWORK_ERROR: {
      key: 'network',
      icon: '<svg class="w-5 h-5 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 4.243a5 5 0 010-7.072m-2.829 2.829L3 3m5.464 12.536A9 9 0 013 12"/></svg>',
      bg: 'bg-slate-900 border-sky-500/50 text-white shadow-sky-950/40',
      badgeBg: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
      label: 'Network Offline',
      duration: 6000
    },
    TIMEOUT: {
      key: 'timeout',
      icon: '<svg class="w-5 h-5 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      bg: 'bg-slate-900 border-orange-500/50 text-white shadow-orange-950/40',
      badgeBg: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      label: 'Request Timeout',
      duration: 6000
    },
    RATE_LIMITED: {
      key: 'rate_limit',
      icon: '<svg class="w-5 h-5 text-yellow-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>',
      bg: 'bg-slate-900 border-yellow-500/50 text-white shadow-yellow-950/40',
      badgeBg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      label: 'Slow Down',
      duration: 7000
    },
    SERVER_ERROR: {
      key: 'error',
      icon: '<svg class="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      bg: 'bg-slate-900 border-red-500/50 text-white shadow-red-950/40',
      badgeBg: 'bg-red-500/20 text-red-300 border-red-500/30',
      label: 'Server Error',
      duration: 6000
    },
    WARNING: {
      key: 'warning',
      icon: '<svg class="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
      bg: 'bg-slate-900 border-amber-500/50 text-white shadow-amber-950/40',
      badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      label: 'Warning',
      duration: 5000
    },
    INFO: {
      key: 'info',
      icon: '<svg class="w-5 h-5 text-teal-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      bg: 'bg-slate-900 border-teal-500/40 text-white shadow-teal-950/40',
      badgeBg: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      label: 'Notice',
      duration: 4000
    }
  };

  // Recent toast cache for debouncing and storm prevention
  const recentToasts = new Map();
  const DEDUP_WINDOW_MS = 1500;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c] || c;
    });
  }

  function getOrCreateContainer() {
    let container = document.getElementById('toast-container') || document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed bottom-5 right-5 z-[99999] flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2.5rem)] pointer-events-none';
      document.body.appendChild(container);
    }
    return container;
  }

  function normalizeConfig(typeOrState) {
    if (!typeOrState) return TOAST_TYPES.INFO;
    const str = String(typeOrState).toUpperCase().trim();

    if (TOAST_TYPES[str]) return TOAST_TYPES[str];

    // Alias lookups
    switch (str) {
      case 'SUCCESS':
        return TOAST_TYPES.SUCCESS;
      case 'VALIDATION':
      case 'VALIDATION_ERROR':
      case 'INVALID':
        return TOAST_TYPES.VALIDATION_ERROR;
      case 'AUTH':
      case 'AUTHENTICATION_ERROR':
      case 'UNAUTHORIZED':
        return TOAST_TYPES.AUTHENTICATION_ERROR;
      case 'FORBIDDEN':
      case 'AUTHORIZATION_ERROR':
      case 'BLOCKED':
      case 'LANDLORD_BLOCKED':
        return TOAST_TYPES.AUTHORIZATION_ERROR;
      case 'NETWORK':
      case 'NETWORK_ERROR':
      case 'OFFLINE':
        return TOAST_TYPES.NETWORK_ERROR;
      case 'TIMEOUT':
      case 'TIMED_OUT':
        return TOAST_TYPES.TIMEOUT;
      case 'RATE_LIMIT':
      case 'RATE_LIMITED':
      case 'TOO_MANY_REQUESTS':
        return TOAST_TYPES.RATE_LIMITED;
      case 'ERROR':
      case 'CRITICAL':
      case 'SERVER_ERROR':
      case 'INTERNAL_SERVER_ERROR':
        return TOAST_TYPES.SERVER_ERROR;
      case 'WARN':
      case 'WARNING':
        return TOAST_TYPES.WARNING;
      case 'INFO':
      default:
        return TOAST_TYPES.INFO;
    }
  }

  const AppToast = {
    /**
     * Display a toast notification with full options
     */
    show(message, options = {}) {
      if (!message || typeof message !== 'string') {
        if (options && options.message) {
          message = options.message;
        } else {
          return null;
        }
      }

      // Deduplication check
      const typeKey = typeof options === 'string' ? options : (options.type || options.state || 'info');
      const dedupKey = `${typeKey}:${message.trim()}`;
      const now = Date.now();
      if (recentToasts.has(dedupKey)) {
        const lastSeen = recentToasts.get(dedupKey);
        if (now - lastSeen < DEDUP_WINDOW_MS) {
          return null; // Suppress duplicate storm
        }
      }
      recentToasts.set(dedupKey, now);

      const config = normalizeConfig(typeKey);
      const container = getOrCreateContainer();

      const title = options.title || (options.showBadge !== false ? config.label : null);
      const details = options.details || null;
      const retryAfter = options.retryAfter || null;
      const duration = options.duration || (retryAfter ? Math.max(config.duration, retryAfter * 1000) : config.duration);
      const isSticky = options.sticky === true;

      const toast = document.createElement('div');
      toast.className = `group pointer-events-auto rounded-xl border p-3.5 shadow-2xl backdrop-blur-md transform transition-all duration-300 ease-out translate-y-3 opacity-0 ${config.bg}`;
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'polite');

      let detailsHtml = '';
      if (details) {
        if (Array.isArray(details)) {
          detailsHtml = `<ul class="mt-1.5 list-disc list-inside text-[11px] text-slate-300/90 space-y-0.5">${details.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`;
        } else if (typeof details === 'string') {
          detailsHtml = `<p class="mt-1 text-[11px] text-slate-300/90 leading-tight">${escapeHtml(details)}</p>`;
        }
      }

      let retryHtml = '';
      if (retryAfter && retryAfter > 0) {
        retryHtml = `
          <div class="mt-2 flex items-center gap-1.5 text-[11px] text-amber-300 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 w-fit">
            <span>⏱️ Cooldown active:</span>
            <span class="font-bold toast-countdown" data-seconds="${retryAfter}">${retryAfter}s</span>
          </div>
        `;
      }

      toast.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="mt-0.5">${config.icon}</div>
          <div class="flex-1 min-w-0 pr-1">
            <div class="flex items-center gap-2 mb-0.5">
              ${title ? `<span class="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${config.badgeBg}">${escapeHtml(title)}</span>` : ''}
            </div>
            <p class="text-xs font-medium text-slate-100 leading-snug break-words">${escapeHtml(message)}</p>
            ${detailsHtml}
            ${retryHtml}
          </div>
          <button type="button" class="text-slate-400 hover:text-white transition-colors p-1 -mr-1 -mt-1 rounded-lg hover:bg-white/10 shrink-0" aria-label="Dismiss">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      `;

      // Manual dismiss button
      const closeBtn = toast.querySelector('button');
      let dismissTimeout = null;

      const dismiss = () => {
        if (dismissTimeout) clearTimeout(dismissTimeout);
        toast.classList.add('opacity-0', 'translate-y-3', 'scale-95');
        setTimeout(() => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 250);
      };

      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dismiss();
        });
      }

      // Append & Animate In
      container.appendChild(toast);
      requestAnimationFrame(() => {
        toast.classList.remove('translate-y-3', 'opacity-0');
      });

      // Handle Countdown if active
      if (retryAfter && retryAfter > 0) {
        let secRemaining = retryAfter;
        const countdownEl = toast.querySelector('.toast-countdown');
        const intervalId = setInterval(() => {
          secRemaining--;
          if (countdownEl) countdownEl.textContent = `${secRemaining}s`;
          if (secRemaining <= 0) {
            clearInterval(intervalId);
            if (!isSticky) dismiss();
          }
        }, 1000);
      }

      // Auto-dismiss logic with pause on hover
      if (!isSticky) {
        const scheduleDismiss = (ms) => {
          dismissTimeout = setTimeout(dismiss, ms);
        };

        scheduleDismiss(duration);

        toast.addEventListener('mouseenter', () => {
          if (dismissTimeout) clearTimeout(dismissTimeout);
        });

        toast.addEventListener('mouseleave', () => {
          scheduleDismiss(2000);
        });
      }

      return toast;
    },

    // High-level semantic helpers
    success(msg, options = {}) {
      return this.show(msg, { ...options, type: 'SUCCESS' });
    },
    validation(msg, details = null, options = {}) {
      return this.show(msg, { ...options, type: 'VALIDATION_ERROR', details });
    },
    auth(msg, options = {}) {
      return this.show(msg, { ...options, type: 'AUTHENTICATION_ERROR' });
    },
    forbidden(msg, options = {}) {
      return this.show(msg, { ...options, type: 'AUTHORIZATION_ERROR' });
    },
    network(msg, options = {}) {
      return this.show(msg, { ...options, type: 'NETWORK_ERROR' });
    },
    timeout(msg, options = {}) {
      return this.show(msg, { ...options, type: 'TIMEOUT' });
    },
    rateLimited(msg, retryAfter = null, options = {}) {
      return this.show(msg, { ...options, type: 'RATE_LIMITED', retryAfter });
    },
    serverError(msg, options = {}) {
      return this.show(msg, { ...options, type: 'SERVER_ERROR' });
    },
    warning(msg, options = {}) {
      return this.show(msg, { ...options, type: 'WARNING' });
    },
    info(msg, options = {}) {
      return this.show(msg, { ...options, type: 'INFO' });
    }
  };

  // Expose globally
  global.AppToast = AppToast;

  // Backwards compatibility for existing legacy showToast(message, type) callers
  global.showToast = function (message, type = 'info') {
    return AppToast.show(message, { type });
  };

})(typeof window !== 'undefined' ? window : this);
