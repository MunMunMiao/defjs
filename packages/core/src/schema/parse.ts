import { _array } from './array';
import { _enum } from './enum';
import { getMetadata } from './metadata';
import { _number } from './number';
import { _object } from './object';
import { type Schema, isSchema } from './schema';
import { _string } from './string';
import type { Infer, } from './util';
import { isArray, isArrayBuffer, isBlob, isBoolean, isFile, isNumber, isObject, isString, isUndefined } from './util';

export const example = {
  id: 1,
  name: 'example',
  array: [1, 2, 3],
  user_info: {
    key: 'value',
    data: 1,
  },
  status: 'ACTIVE',
  arrStatus: 'MIAO',
  children: [
    {
      id: 2,
      user_info: {
        data: 1001,
      },
    },
  ],
};

const schema1 = _object({
  id: _number(),
  name: _string().default('Jack'),
  array: _array(_string().optional()),
  info: _object({
    key: _string(),
    data: _number(),
    id: _number().optional(),
  })
    .alias('user_info'),
  status: _enum(['ACTIVE', 'INACTIVE']),
  arrStatus: _enum({
    ID: 'ID',
    NAME: 'NAME',
  }).optional(),
  children: () => _array(schema),
});

type ParseContext = {
  paths: string[];
  issues: Issue[];
  depth: number;
};

type Issue = {
  expect: unknown;
  receive: unknown;
};

export function addIssue(ctx: ParseContext, issue: Issue) {
  ctx.issues.push(issue);
}

export function parse<S extends Schema>(schema: S, input: unknown): [Infer<S>, Error | null] {
  const ctx: ParseContext = {
    paths: [],
    issues: [],
    depth: -1,
  };
  if (isSchema(schema)) {

  } else {
    addIssue(ctx, {
      expect: 'Schema',
      receive: schema,
    })
  }
  const r = _parse(ctx, schema, input);
  return [r, null];
}

function _parse(ctx: ParseContext, schema: Schema, input: unknown): any {
  ctx.depth++;
  // 需要判断递归后如何返回错误以及字段路径
  if (!isSchema(schema)) {
    throw new Error('schema is not a Schema');
  }
  const metadata = getMetadata(schema);

  switch (metadata.kind) {
    case 'array': {
      const optional = metadata.optional ?? false;

      if (!isSchema(metadata.shape)) {
        return metadata.default;
      }

      if (!isArray(input)) {
        if (optional) {
          return undefined;
        }
        return metadata.default;
      }

      const r: unknown[] = Array(input.length);

      for (let i = 0; i < input.length; i++) {
        const v = _parse(ctx, metadata.shape, input[i]);
        r[i] = v;
      }

      return r;
    }
    case 'object': {
      const optional = metadata.optional ?? false;
      const r: { [key: string]: unknown } = {};

      if (!isObject(input)) {
        if (optional) {
          return undefined;
        }
        return r;
      }

      for (const [key, shape] of Object.entries(metadata.shape)) {
        const _shape = typeof shape === 'function' ? shape() : shape;
        const smd = getMetadata(_shape);
        const _key = smd.alias || key;
        r[key] = _parse(ctx, _shape, input[_key]);
      }

      return r;
    }
    case 'enum': {
      const values = Object.values(metadata.enum);
      const optional = metadata.optional ?? false;

      if (!isString(input) && !isNumber(input)) {
        if (optional) {
          return undefined;
        }
        addIssue(ctx, {
          kind: metadata.kind,
          expect: metadata.kind,
          receive: input,
        });
        return metadata.default;
      }

      if (!values.includes(input)) {
        if (optional) {
          return undefined;
        }
        return metadata.default;
      }

      return input;
    }
    case 'number': {
      const optional = metadata.optional ?? false;

      if (!isNumber(input)) {
        if (optional) {
          return undefined;
        }
        const v = Number(input);
        return Number.isNaN(v) ? metadata.default : v;
      }

      return input;
    }
    case 'string': {
      const optional = metadata.optional ?? false;

      if (!isString(input)) {
        if (optional) {
          return undefined;
        }
        if (isUndefined(input)) {
          return metadata.default;
        }
        return String(input);
      }

      return input;
    }
    case 'boolean': {
      const optional = metadata.optional ?? false;
      const v = Boolean(input);

      if (!isBoolean(v)) {
        if (optional) {
          return undefined;
        }
        return metadata.default;
      }

      return v;
    }
    case 'null': {
      return null;
    }
    case 'arraybuffer': {
      const optional = metadata.optional ?? false;

      if (!isArrayBuffer(input)) {
        if (optional) {
          return undefined;
        }
        return metadata.default;
      }

      return input;
    }
    case 'blob': {
      const optional = metadata.optional ?? false;

      if (!isBlob(input)) {
        if (optional) {
          return undefined;
        }
        return metadata.default;
      }

      return input;
    }
    case 'file': {
      const optional = metadata.optional ?? false;

      if (!isFile(input)) {
        if (optional) {
          return undefined;
        }
        return metadata.default;
      }

      return input;
    }
    case 'any': {
      return input;
    }
    case 'unknown': {
      return input;
    }
    case 'or': {
      const shapes = metadata.shapes;

      if (!isArray(shapes)) {
        return metadata.default;
      }

      if (shapes.length === 0) {
        return metadata.default;
      }

      const optional = metadata.optional ?? false;
      let err: Error | null = null;
      let value;

      for (const shape of shapes) {
        [value, err] = _parse(ctx, shape, input);
        if (!err) {
          break;
        }
      }

      if (err) {
        if (optional) {
          return undefined;
        }
        return metadata.default;
      }

      return value;
    }
    default:
      return undefined;
  }
}

const schema = _object({
  id: _number(),
  name: _string().default('Jack'),
  children: () => _array(schema),
});













type M = Infer<typeof schema>


(() => {
  const [result, err] = parse(schema, example);
  if (err) {
    console.error(err);
    console.log('-----------------------');
  }
  console.log(result);
  console.log(result.children);
})();
