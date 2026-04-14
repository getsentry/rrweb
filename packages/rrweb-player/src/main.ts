import { asClassComponent } from 'svelte/legacy';
import _Player from './Player.svelte';
import type { RRwebPlayerOptions } from './types';

const Compat = asClassComponent(_Player);

export class Player extends Compat {
  constructor(
    options: {
      // for compatibility
      data?: RRwebPlayerOptions['props'];
    } & RRwebPlayerOptions,
  ) {
    super({
      target: options.target,
      props: options.data || options.props,
    });
  }
}

export default Player;
