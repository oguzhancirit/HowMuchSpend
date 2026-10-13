// Retire only the old optional lock preference; financial and push storage stay intact.
try { localStorage.removeItem('howmuchspend.appLock.v1'); } catch {}
await import('./app.js?v=31');
