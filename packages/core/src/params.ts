export function decode(value: string): string[][] {
  if (/^\?/.test(value)) {
    value = value.replace(/^\?/, '')
  }
  return value
    .split('&')
    .map(pair => pair.split('='))
    .map(([key, value]) => [decodeURIComponent(key), decodeURIComponent(value)])
}

export class HttpParams {
  private _value: Map<string, string[]> = new Map<string, string[]>()

  constructor(init?: string[][] | Record<string, string | number> | string) {
    switch (true) {
      case Array.isArray(init): {
        for (const [key, value] of init) {
          this.append(key, value)
        }
        break
      }
      case typeof init === 'string': {
        for (const [key, value] of decode(init)) {
          this.append(key, value)
        }
        break
      }
      case typeof init === 'object' && init !== null: {
        for (const [key, value] of Object.entries(init)) {
          this.append(key, value)
        }
        break
      }
    }
  }

  get(name: string): string | null {
    return this._value.get(name)?.[0] ?? null
  }

  append(name: string, value: string | number): void {
    const values = this._value.get(name) ?? []
    this._value.set(name, [...values, value.toString()])
  }

  set(name: string, value: string | number): void {
    this._value.set(name, [value.toString()])
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

  forEach(callback: (value: string, key: string, parent: HttpParams) => void, thisArg?: any): void {
    for (const [key, values] of this._value.entries()) {
      for (const value of values) {
        callback.call(thisArg, value, key, this)
      }
    }
  }

  getAll(name: string): string[] {
    return this._value.get(name) ?? []
  }

  has(name: string, value?: string | number): boolean {
    if (value) {
      const values = this._value.get(name)
      if (!values) {
        return false
      }
      return values.includes(value.toString())
    } else {
      return this._value.has(name)
    }
  }

  sort(): void {
    this._value = new Map([...this._value].sort(([a], [b]) => a.localeCompare(b)))
  }

  toString(): string {
    const strings: [string, string][] = []
    for (const [key, values] of this._value.entries()) {
      for (const value of values) {
        strings.push([key, value])
      }
    }
    return strings.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
  }
}
