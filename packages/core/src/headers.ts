export function decodeValue(value: string): string[] {
  return value.split(',').map(v => decodeURIComponent(v))
}

export class HttpHeaders {
  private _value: Map<string, string[]> = new Map<string, string[]>()

  constructor(init?: [string, string][] | Record<string, string>) {
    switch (true) {
      case Array.isArray(init): {
        for (const [key, value] of init) {
          const vvv = decodeValue(value)
          for (const mmm of vvv) {
            this.append(key.toLowerCase(), mmm)
          }
        }
        break
      }
      case typeof init === 'object' && init !== null: {
        for (const [key, value] of Object.entries(init)) {
          const vvv = decodeValue(value)
          for (const mmm of vvv) {
            this.append(key.toLowerCase(), mmm)
          }
        }
        break
      }
    }
  }

  get(name: string): string | null {
    return this._value.get(name.toLowerCase())?.[0] ?? null
  }

  append(name: string, value: string | number): void {
    const values = this._value.get(name.toLowerCase()) ?? []
    this._value.set(name.toLowerCase(), [...values, value.toString()])
  }

  set(name: string, value: string | number): void {
    this._value.set(name.toLowerCase(), [value.toString()])
  }

  delete(name: string, value?: string | number): void {
    if (value) {
      const values = this._value.get(name)
      if (!values) {
        return
      }
      this._value.set(
        name,
        values.filter(v => v !== value.toString()),
      )
    } else {
      this._value.delete(name)
    }
  }

  forEach(callback: (value: string, key: string, parent: HttpHeaders) => void, thisArg?: any): void {
    for (const [key, values] of this._value.entries()) {
      for (const value of values) {
        callback.call(thisArg, value, key, this)
      }
    }
  }

  getAll(name: string): string[] {
    return this._value.get(name.toLowerCase()) ?? []
  }

  has(name: string, value?: string | number): boolean {
    if (value) {
      const values = this._value.get(name.toLowerCase())
      if (!values) {
        return false
      }
      return values.includes(value.toString())
    } else {
      return this._value.has(name.toLowerCase())
    }
  }

  sort(): void {
    this._value = new Map([...this._value].sort(([a], [b]) => a.localeCompare(b)))
  }
}
