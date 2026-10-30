// Web Audio API Synthesizer - 100% mandiri tanpa file audio eksternal
// Menghasilkan notasi suara yang berbeda untuk Aman, Perhatian, dan Merah

class FinanceAudio {
	private ctx: AudioContext | null = null;

	private getContext(): AudioContext | null {
		if (typeof window === 'undefined') return null;
		try {
			if (!this.ctx) {
				const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
				if (AudioCtx) this.ctx = new AudioCtx();
			}
			if (this.ctx && this.ctx.state === 'suspended') {
				this.ctx.resume();
			}
			return this.ctx;
		} catch (e) {
			return null;
		}
	}

	/**
	 * 1. NOTASI SUARA AMAN (Ceria & Positif)
	 * Digunakan saat: Berhasil simpan bon, berhasil bayar tagihan lunas, atau kondisi aman.
	 * Melodi: Arpeggio C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz) -> C6 (1046Hz)
	 */
	playAman() {
		const ctx = this.getContext();
		if (!ctx) return;
		const now = ctx.currentTime;
		const notes = [
			{ freq: 523.25, time: 0, dur: 0.22 },     // C5
			{ freq: 659.25, time: 0.08, dur: 0.22 },  // E5
			{ freq: 783.99, time: 0.16, dur: 0.25 },  // G5
			{ freq: 1046.50, time: 0.24, dur: 0.42 }  // C6
		];

		notes.forEach(({ freq, time, dur }) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();

			osc.type = 'triangle';
			osc.frequency.setValueAtTime(freq, now + time);

			gain.gain.setValueAtTime(0, now + time);
			gain.gain.linearRampToValueAtTime(0.18, now + time + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

			osc.connect(gain);
			gain.connect(ctx.destination);

			osc.start(now + time);
			osc.stop(now + time + dur + 0.05);
		});
	}

	/**
	 * 2. NOTASI SUARA PERHATIAN (Peringatan Halus / H-5)
	 * Digunakan saat: Tagihan mendekati tanggal jatuh tempo (H-5).
	 * Melodi: Dua nada cautionary tegas & harmonis (E5 -> A5)
	 */
	playPerhatian() {
		const ctx = this.getContext();
		if (!ctx) return;
		const now = ctx.currentTime;
		const notes = [
			{ freq: 659.25, time: 0, dur: 0.2 },      // E5
			{ freq: 880.00, time: 0.13, dur: 0.38 }   // A5
		];

		notes.forEach(({ freq, time, dur }) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();

			osc.type = 'sine';
			osc.frequency.setValueAtTime(freq, now + time);

			gain.gain.setValueAtTime(0, now + time);
			gain.gain.linearRampToValueAtTime(0.2, now + time + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

			osc.connect(gain);
			gain.connect(ctx.destination);

			osc.start(now + time);
			osc.stop(now + time + dur + 0.05);
		});
	}

	/**
	 * 3. NOTASI SUARA MERAH (Kritis / Sudah Lewat Jatuh Tempo)
	 * Digunakan saat: Ada tagihan yang sudah menunggak melewati jatuh tempo.
	 * Melodi: Tiga nada peringatan tegas menurun
	 */
	playMerah() {
		const ctx = this.getContext();
		if (!ctx) return;
		const now = ctx.currentTime;
		const notes = [
			{ freq: 466.16, time: 0, dur: 0.16 },     // Bb4
			{ freq: 415.30, time: 0.12, dur: 0.16 },  // Ab4
			{ freq: 329.63, time: 0.24, dur: 0.42 }   // E4
		];

		notes.forEach(({ freq, time, dur }) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();

			osc.type = 'sawtooth';
			osc.frequency.setValueAtTime(freq, now + time);

			gain.gain.setValueAtTime(0, now + time);
			gain.gain.linearRampToValueAtTime(0.16, now + time + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

			osc.connect(gain);
			gain.connect(ctx.destination);

			osc.start(now + time);
			osc.stop(now + time + dur + 0.05);
		});
	}
}

export const sound = new FinanceAudio();
