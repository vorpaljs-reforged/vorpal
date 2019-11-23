import Vorpal from 'vorpal';

export { default } from './vorpal';
export { default as Command } from './command';
export { default as CommandInstance } from './command-instance';
export { default as Logger } from './logger';
export { default as History } from './history';
export { default as Option } from './option';

const x = new Vorpal();
const y = x.parse(['x']);
const z = x.parse(['x'], {
  use: 'minimist'
});