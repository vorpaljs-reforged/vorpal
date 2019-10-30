import {LocalStorage as LocalStorageO} from 'node-localstorage';
import os from 'os';
import path from 'path';

const temp = path.normalize(path.join(os.tmpdir(), '/.local_storage_'));
const DEFAULT_STORAGE_PATH = temp;

export default class LocalStorage {
  public _localStorage: LocalStorageO;

  constructor(id: string) {
    if (!id) {
      throw new TypeError('Id need to be provided');
    }
    this._localStorage = new LocalStorageO(DEFAULT_STORAGE_PATH + id);
  }

  public getItem(key: string) {
    return this._localStorage.getItem(key);
  }

  public setItem(key: string, value: string) {
    this._localStorage.setItem(key, value);
  }

  public removeItem(key: string) {
    return this._localStorage.removeItem(key);
  }
}
