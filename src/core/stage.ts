// What the projected stage page should be playing. The server moves it on proxy events; the page polls it.

export type StageState = 'idle' | 'intro' | 'masked' | 'blocked' | 'allowed' | 'sent' | 'denied' | 'retry' | 'locked';

export class Stage {
  seq = 0;
  state: StageState = 'idle';
  caption = '';
  grantId: string | null = null;

  set(state: StageState, grantId?: string | null): void {
    this.state = state;
    if (grantId !== undefined) this.grantId = grantId;
    this.seq += 1;
  }

  reset(): void {
    this.caption = '';
    this.set('idle', null);
  }
}
