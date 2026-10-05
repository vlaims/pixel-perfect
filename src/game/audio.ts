export class Sfx {
  ctx: AudioContext;
  master: GainNode;
  buffers = new Map<string, AudioBuffer>();

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  setVolume(v: number) {
    this.master.gain.value = v;
  }

  async load(name: string, url: string) {
    try {
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      this.buffers.set(name, await this.ctx.decodeAudioData(data));
    } catch (e) {
      console.warn("audio load failed", name, e);
    }
  }

  resume() {
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  play(name: string, vol = 1, rate = 1) {
    const buf = this.buffers.get(name);
    if (!buf || vol <= 0.01) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
  }
}
