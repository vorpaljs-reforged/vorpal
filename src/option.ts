export default class Option {
  public required: number;
  public optional: number;
  public bool: boolean;
  public flags: string[];
  public long?: string;
  public short?: string;

  /**
   * Initialize a new `Option` instance.
   */
  constructor(_flags: string, public description: string = '', public autocomplete: Function) {
    this.required = _flags.includes('<') ? _flags.indexOf('<') : 0;
    this.optional = _flags.includes('[') ? _flags.indexOf('[') : 0;
    this.bool = !_flags.includes('-no-');
    this.autocomplete = autocomplete;

    this.flags = _flags.split(/[ ,|]+/);
    if (this.flags.length > 1 && !/^[[<]/.test(this.flags[1])) {
      this.assignFlag(this.flags.shift());
    }
    this.assignFlag(this.flags.shift());
  }

  /**
   * Return option name.
   */
  public name() {
    if (this.long !== undefined) {
      return this.long.replace('--', '').replace('no-', '');
    }
    return this.short && this.short.replace('-', '');
  }

  /**
   * Check if `arg` matches the short or long flag.
   */
  public is(arg: string) {
    return arg === this.short || arg === this.long;
  }

  /**
   * Assigned flag to either long or short.
   */
  public assignFlag(flag?: string) {
    if (flag && flag.startsWith('--')) {
      this.long = flag;
    } else {
      this.short = flag;
    }
  }
}
