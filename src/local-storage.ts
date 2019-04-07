import {LocalStorage as LocalStorageO} from 'node-localstorage'
import os                              from 'os'
import path                            from 'path'

const temp                 = path.normalize(path.join(os.tmpdir(), '/.local_storage_'))
const DEFAULT_STORAGE_PATH = temp

export default class LocalStorage {
    public _localStorage: LocalStorageO

    public setId(id) {
        if (id === undefined) {
            throw new Error('vorpal.localStorage() requires a unique key to be passed in.')
        }
        if (!this._localStorage) {
            this._localStorage = new LocalStorageO(DEFAULT_STORAGE_PATH + id)
        }
    }

    public validate() {
        if (this._localStorage === undefined) {
            throw new Error('Vorpal.localStorage() was not initialized before writing data.')
        }
    }

    public getItem(key, value) {
        this.validate()
        return this._localStorage.getItem(key, value)
    }

    public setItem(key, value) {
        this.validate()
        return this._localStorage.setItem(key, value)
    }

    public removeItem(key) {
        this.validate()
        return this._localStorage.removeItem(key)
    }
}
