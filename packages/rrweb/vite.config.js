import config from '../../vite.config.default';

export default config(
  {
    rrweb: 'src/index.ts',
    'canvas-manager': 'src/entries/canvas-manager.ts',
  },
  'rrweb',
  {
    umdNames: {
      'canvas-manager': 'rrwebCanvasManager',
    },
  },
);
