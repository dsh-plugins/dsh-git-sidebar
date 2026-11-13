// node_modules/.pnpm/@deepseek-ai+cosmokit@1.9.0/node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
var write = /* @__PURE__ */ Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
  if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
  } finally {
    ancestors.delete(value);
  }
}
function createVolatile(value) {
  let current = snapshot(value);
  return Object.freeze({
    get: () => current,
    [write]: (value2) => {
      current = value2;
    }
  });
}
function isVolatile(value) {
  return typeof value === "object" && value !== null && write in value;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  const ancestors = /* @__PURE__ */ new Set();
  function compare(a2, b2) {
    if (a2 === b2) return true;
    if (isVolatile(a2) || isVolatile(b2)) return isVolatile(a2) && isVolatile(b2);
    if (!strict && isNullable(a2) && isNullable(b2)) return true;
    if (typeof a2 !== typeof b2 || typeof a2 !== "object" || !a2 || !b2) return false;
    if (ancestors.has(a2)) return false;
    function check(test, then) {
      return test(a2) ? test(b2) ? then(a2, b2) : false : test(b2) ? false : void 0;
    }
    ancestors.add(a2);
    try {
      return check(Array.isArray, (a3, b3) => {
        if (a3.length !== b3.length) return false;
        for (let index = 0; index < a3.length; index++) if (!compare(a3[index], b3[index])) return false;
        return true;
      }) ?? check(is("Date"), (a3, b3) => a3.valueOf() === b3.valueOf()) ?? check(is("URL"), (a3, b3) => a3.href === b3.href) ?? check(is("RegExp"), (a3, b3) => a3.source === b3.source && a3.flags === b3.flags) ?? check(isArrayBufferLike, (a3, b3) => {
        if (a3.byteLength !== b3.byteLength) return false;
        const viewA = new Uint8Array(a3);
        const viewB = new Uint8Array(b3);
        for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
        return true;
      }) ?? ((!strict || [a2, b2].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
        ...a2,
        ...b2
      }).every((key) => compare(a2[key], b2[key])));
    } finally {
      ancestors.delete(a2);
    }
  }
  return compare(a, b);
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// node_modules/.pnpm/@deepseek-ai+schemastery@3.19.0/node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = /* @__PURE__ */ Symbol.for("schemastery");
var kValidationError = /* @__PURE__ */ Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (isVolatile(value)) value = value.get();
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.volatile = function volatile() {
  if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
  return this.extra("volatile", true);
};
var resolvers = {};
var checkedVolatile = /* @__PURE__ */ Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
  const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
  if (states.has(blocked)) return;
  states.add(blocked);
  seen.set(schema, states);
  if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
  const nested = blocked || !!schema.meta?.volatile;
  if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
  if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
  if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
  if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve3) {
  resolvers[type] = resolve3;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (!options[checkedVolatile]) {
    validateVolatileSchema(schema, options.path);
    options = {
      ...options,
      [checkedVolatile]: true
    };
  }
  if (schema.meta?.volatile) {
    const inner = Schema(schema);
    inner.meta = {
      ...schema.meta,
      volatile: false
    };
    const [value, adapted] = Schema.resolve(data, inner, options, strict);
    try {
      return [createVolatile(value), adapted];
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error), options);
    }
  }
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
    validateVolatileSchema(schema.inner, options.path, true);
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name2, keys, format) {
  formatters[name2] = format;
  Object.assign(Schema, { [name2](...args) {
    const schema = new Schema({ type: name2 });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name2 === "object" || name2 === "dict") schema.meta.default = {};
    else if (name2 === "array" || name2 === "tuple") schema.meta.default = [];
    else if (name2 === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// node_modules/.pnpm/@deepseek-ai+dsh-typert-pro_2f8178087ff5b29d6de54290762a244a/node_modules/@deepseek-ai/dsh-typert-protocol/lib/index.js
import { Context, Service } from "@deepseek-ai/cordis";
var TYPERT_REMOTE_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
function isTypertRemoteSegment(value) {
  return value !== "." && value !== ".." && TYPERT_REMOTE_SEGMENT_PATTERN.test(value);
}
function bindTypertRemote(service, serviceKey, options = {}) {
  validateName("service key", serviceKey);
  const namespace = options.namespace ?? serviceKey;
  validateName("namespace", namespace);
  const ctx = Reflect.get(service, "ctx");
  if (Context.is(ctx)) provideInvocationAccessor(ctx);
  return Object.freeze({
    service,
    serviceKey,
    namespace
  });
}
var TypertRemoteService = class extends Service {
  /** Visible binding consumed by the Gateway's source-mode discovery. */
  typertRemote;
  /**
  * Register the Service and bind the same key to Typert Gateway.
  * @param ctx - owning Cordis Context.
  * @param serviceKey - exact Cordis service key and default wire namespace.
  * @param options - optional wire namespace.
  */
  constructor(ctx, serviceKey, options = {}) {
    super(ctx, serviceKey);
    this.typertRemote = bindTypertRemote(this, this.name, options);
  }
};
function provideInvocationAccessor(ctx) {
  if (Object.hasOwn(ctx.root.reflect.props, "invocation")) return;
  ctx.root.accessor("invocation", { get: () => void 0 });
}
function validateName(subject, value) {
  if (!isTypertRemoteSegment(value)) throw new TypeError(`typert-protocol: ${subject} must contain only RPC endpoint segment characters`);
}

// src/remote-descriptor.ts
var REMOTE_METHODS = [
  "status",
  "diff",
  "stage",
  "unstage",
  "discard",
  "commit",
  "history",
  "commitDetail",
  "branches",
  "checkout",
  "createBranch",
  "stashes",
  "stash",
  "stashApply",
  "sync"
];

// src/host/branch.ts
var MAX_BRANCH_NAME = 240;
var MAX_STASH_INDEX = 999;
async function checkout(git, branch) {
  await git("checkout", ["checkout", "--", branch]);
}
async function createBranch(git, name2, from2) {
  const start = from2 === void 0 || from2.length === 0 ? [] : [from2];
  await git("checkout", ["checkout", "-b", name2, ...start]);
}
async function isValidBranchName(git, name2) {
  if (name2.length === 0 || name2.length > MAX_BRANCH_NAME) return false;
  const check = await git("check-ref-format", ["check-ref-format", "--branch", name2], [0, 1, 128]);
  return check.exitCode === 0;
}
async function hasTrackedChanges(git) {
  const status = await git("status", ["status", "--porcelain", "--untracked-files=no"]);
  return status.stdout.trim().length > 0;
}
async function stashPush(git, message) {
  const text2 = message?.trim() ?? "";
  await git("stash", text2.length === 0 ? ["stash", "push"] : ["stash", "push", "-m", text2]);
}
async function stashApply(git, index, drop) {
  const ref = `stash@{${index}}`;
  await git("stash", [drop ? "pop" : "apply", ref]);
}
function validStashIndex(index) {
  return typeof index === "number" && Number.isInteger(index) && index >= 0 && index <= MAX_STASH_INDEX;
}
async function sync(git, action) {
  switch (action) {
    case "fetch":
      await git("fetch", ["fetch"]);
      return;
    case "pull":
      await git("pull", ["pull", "--ff-only"]);
      return;
    case "push":
      await git("push", ["push"]);
      return;
  }
}
function isSyncAction(action) {
  return action === "fetch" || action === "pull" || action === "push";
}

// src/host/env.ts
var GIT_ENV = {
  ...Object.fromEntries([
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_CONFIG",
    "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_COUNT",
    "GIT_PREFIX",
    "GIT_ATTR_SOURCE"
  ].map((key) => [key, void 0])),
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  LC_ALL: "C"
};
var GIT_PREFIX = ["--no-optional-locks", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"];

// src/host/parse.ts
var NUL = "\0";
function parseTopLevel(output) {
  const [root = ""] = output.split(/\r?\n/);
  return root;
}
function parseName(output) {
  const [name2 = ""] = output.split(/\r?\n/);
  return name2.length === 0 ? null : name2;
}
function firstLine(text2) {
  const lines2 = text2.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  return lines2.find((line) => !line.startsWith("warning:")) ?? lines2[0] ?? "no diagnostic";
}
function changeStatus(code) {
  switch (code) {
    case "M":
    case "T":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "added";
    default:
      return void 0;
  }
}
function splitRecord(record, fields) {
  const parts = record.split(" ");
  return { parts, path: parts.slice(fields).join(" ") };
}
function parseStatus(output, truncated = false) {
  const fields = output.split(NUL);
  const staged = [];
  const unstaged = [];
  const conflicts = [];
  for (let index = truncated ? 1 : 0; index < fields.length; index += 1) {
    const record = fields[index] ?? "";
    if (record.length === 0) continue;
    switch (record.charAt(0)) {
      case "1": {
        const { parts, path } = splitRecord(record, 8);
        addPair(parts[1] ?? "..", path, void 0, staged, unstaged);
        break;
      }
      case "2": {
        const { parts, path } = splitRecord(record, 9);
        const from2 = fields[index + 1];
        index += 1;
        const origin = from2 === void 0 || from2.length === 0 ? void 0 : from2;
        addPair(parts[1] ?? "..", path, origin, staged, unstaged);
        break;
      }
      case "u": {
        const { path } = splitRecord(record, 10);
        conflicts.push({ path, status: "conflicted" });
        break;
      }
      case "?": {
        const path = record.slice(2);
        if (path.length > 0) unstaged.push({ path, status: "untracked" });
        break;
      }
      default:
        break;
    }
  }
  return { staged, unstaged, conflicts };
}
function addPair(pair, path, from2, staged, unstaged) {
  const index = changeStatus(pair.charAt(0));
  const worktree = changeStatus(pair.charAt(1));
  const beyond = from2 === void 0 ? {} : { from: from2 };
  if (index !== void 0) staged.push({ path, status: index, ...beyond });
  if (worktree !== void 0) unstaged.push({ path, status: worktree, ...beyond });
}
function parseNumstat(output) {
  const fields = output.split(NUL);
  const records = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index] ?? "";
    if (field.length === 0) continue;
    const parts = field.split("	");
    const additions = parts[0] ?? "";
    const deletions = parts[1] ?? "";
    if (parts.length < 3) continue;
    if (parts.length === 3) {
      const target = fields[index + 2];
      index += 2;
      if (target !== void 0 && target.length > 0) records.push({ additions, deletions, path: target });
      continue;
    }
    records.push({ additions, deletions, path: parts.slice(2).join("	") });
  }
  return records;
}
function isBinary(records) {
  return records.some((record) => record.additions === "-" && record.deletions === "-");
}
function hunkHeader(line) {
  let ats = 0;
  while (line.charAt(ats) === "@") ats += 1;
  const close = line.indexOf("@".repeat(ats), ats);
  const header = close < 0 ? line : line.slice(0, close + ats);
  return {
    header,
    section: close < 0 ? "" : line.slice(close + ats).trim(),
    columns: Math.max(1, ats - 1)
  };
}
function hunkLine(line, columns) {
  const prefix = line.slice(0, columns);
  if (prefix.length < columns) return void 0;
  const text2 = line.slice(columns);
  if (/^ *$/.test(prefix)) return { kind: "context", text: text2 };
  if (/^\+*$/.test(prefix)) return { kind: "added", text: text2 };
  if (/^-*$/.test(prefix)) return { kind: "removed", text: text2 };
  return { kind: "context", text: text2 };
}
function parsePatch(text2) {
  const hunks = [];
  let lines2;
  let columns = 1;
  for (const raw of text2.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith("@@")) {
      const parsed2 = hunkHeader(line);
      columns = parsed2.columns;
      lines2 = [];
      hunks.push(parsed2.section.length === 0 ? { header: parsed2.header, lines: lines2 } : { header: parsed2.header, section: parsed2.section, lines: lines2 });
      continue;
    }
    if (line.startsWith("diff --git ") || line.startsWith("diff --cc ")) {
      lines2 = void 0;
      continue;
    }
    if (lines2 === void 0 || line.length === 0) continue;
    const parsed = hunkLine(line, columns);
    if (parsed !== void 0) lines2.push(parsed);
  }
  return hunks;
}

// src/host/git.ts
var GitMissingError = class extends Error {
  name = "GitMissingError";
  constructor(message, options) {
    super(message, options);
  }
};
var GitFailure = class extends Error {
  constructor(command, exitCode, stderr) {
    super(`git ${command} failed (${exitCode ?? "signal"}): ${firstLine(stderr)}`);
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
  command;
  exitCode;
  stderr;
  name = "GitFailure";
};
var GitTimeout = class extends Error {
  constructor(timeoutMs) {
    super(`git did not finish within ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
  }
  timeoutMs;
  name = "GitTimeout";
};
function deadline(upstream, timeoutMs) {
  const timer = new AbortController();
  const id = setTimeout(() => timer.abort(new GitTimeout(timeoutMs)), timeoutMs);
  return {
    signal: AbortSignal.any([upstream, timer.signal]),
    dispose: () => clearTimeout(id)
  };
}
function gitIn(ctx, config, session, directory, signal) {
  const policy = ctx.sandboxPolicy.resolve({ session });
  const run = async (name2, args, options, allowedExitCodes = [0]) => await runGit(ctx, config, policy, directory, name2, args, signal, allowedExitCodes, options);
  const runner = async (name2, args, allowedExitCodes = [0]) => await run(name2, args, {}, allowedExitCodes);
  return Object.assign(runner, {
    with: async (name2, args, options, allowedExitCodes = [0]) => await run(name2, args, options, allowedExitCodes)
  });
}
async function runGit(ctx, config, policy, cwd, name2, args, signal, allowedExitCodes, options = {}) {
  const timeout = deadline(signal, options.timeoutMs ?? config.timeoutMs);
  const maxBytes = options.maxOutputBytes ?? config.maxOutputBytes;
  try {
    const program = await resolve2(ctx, config.gitCommand, timeout.signal);
    const command = [program, ...GIT_PREFIX, ...args];
    const argv = policy.mode === "danger-full-access" ? command : (await ctx.sandbox.confine(command, { ...policy, mode: policy.mode }, timeout.signal)).argv;
    timeout.signal.throwIfAborted();
    const child = ctx.subprocess.spawn({
      argv,
      cwd,
      env: GIT_ENV,
      signal: timeout.signal,
      graceMs: config.graceMs,
      stdio: {
        stdin: "ignore",
        stdout: { maxBytes },
        stderr: { maxBytes }
      }
    });
    try {
      const outcome = await child.done;
      timeout.signal.throwIfAborted();
      const stdout = child.collected.stdout?.readFrom(0);
      const stderr = child.collected.stderr?.readFrom(0);
      const stderrText = stderr?.text ?? "";
      if (outcome.exitCode === null || !allowedExitCodes.includes(outcome.exitCode)) {
        throw new GitFailure(name2, outcome.exitCode, stderrText);
      }
      return { stdout: stdout?.text ?? "", stderr: stderrText, exitCode: outcome.exitCode, truncated: stdout?.lossy ?? false };
    } finally {
      child.terminate();
      await child.waitForExit();
    }
  } finally {
    timeout.dispose();
  }
}
async function resolve2(ctx, command, signal) {
  try {
    return await ctx.subprocess.resolveExecutable(command, void 0, signal);
  } catch (error) {
    throw new GitMissingError(
      `git executable ${JSON.stringify(command)} is not available: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

// src/host/refs.ts
import { stat } from "node:fs/promises";
var MAX_HISTORY = 100;
var FIELD = "";
var RECORD = "";
var DECORATION_PREFIX = "HEAD -> ";
async function readHistory(ctx, config, session, directory, args, signal) {
  const limit = clamp(Math.trunc(args.limit), 1, MAX_HISTORY);
  const skip = Number.isFinite(args.skip) && args.skip > 0 ? Math.trunc(args.skip) : 0;
  const git = gitIn(ctx, config, session, await topLevel(gitIn(ctx, config, session, directory, signal)), signal);
  const format = `--format=%H${FIELD}%h${FIELD}%s${FIELD}%an${FIELD}%aI${FIELD}%D${RECORD}`;
  const log = await git("log", ["log", `--max-count=${limit + 1}`, `--skip=${skip}`, format]);
  const records = log.stdout.split(RECORD).filter((record) => record.trim().length > 0);
  const hasMore = records.length > limit;
  const commits = records.slice(0, limit).map(parseCommit);
  return { commits, hasMore };
}
async function readCommitDiff(ctx, config, session, directory, args, signal) {
  if (!/^[0-9a-f]{4,40}$/i.test(args.sha)) {
    return { kind: "error", message: "the commit name is not an object name" };
  }
  try {
    const root = await topLevel(gitIn(ctx, config, session, directory, signal));
    const git = gitIn(
      ctx,
      { ...config, maxOutputBytes: Math.min(config.maxDiffBytes * 2, 67108864) },
      session,
      root,
      signal
    );
    const show = await git("show", ["show", "--format=", "--patch", "--no-color", "--no-ext-diff", args.sha]);
    return await renderCommitPatch(git, args.sha, show.stdout, config.maxDiffBytes);
  } catch (error) {
    if (error instanceof GitFailure) return { kind: "error", message: firstLine(error.stderr) };
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}
async function renderCommitPatch(git, sha, output, maxBytes) {
  const binary = await git("diff-tree", ["diff-tree", "--numstat", "-z", "--no-commit-id", "-r", sha]);
  if (binary.stdout.split("\0").some((field) => field === "-	-")) return { kind: "binary" };
  const bytes = Buffer.from(output, "utf8");
  const truncated = bytes.byteLength > maxBytes;
  const text2 = truncated ? bytes.subarray(0, maxBytes).toString("utf8") : output;
  return { kind: "text", hunks: parsePatch(text2), truncated };
}
async function readBranches(ctx, config, session, directory, signal) {
  const root = await topLevel(gitIn(ctx, config, session, directory, signal));
  const git = gitIn(ctx, config, session, root, signal);
  const format = "--format=%(refname:lstrip=2)";
  const [head, local, remote] = await Promise.all([
    git("symbolic-ref", ["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1, 128]),
    git("for-each-ref", ["for-each-ref", format, "refs/heads/"]),
    git("for-each-ref", ["for-each-ref", format, "refs/remotes/"])
  ]);
  return {
    current: head.exitCode === 0 ? parseName(head.stdout) : null,
    local: lines(local.stdout),
    remote: lines(remote.stdout)
  };
}
async function readStashes(ctx, config, session, directory, signal) {
  const root = await topLevel(gitIn(ctx, config, session, directory, signal));
  const git = gitIn(ctx, config, session, root, signal);
  const list = await git("stash", ["stash", "list", `--format=%gd${FIELD}%gs`], [0, 128]);
  return list.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0).map((line, index) => {
    const [gd = "", ...rest] = line.split(FIELD);
    const position = Number(/^stash@\{(\d+)\}$/.exec(gd)?.[1] ?? index);
    return { index: Number.isFinite(position) ? position : index, subject: rest.join(FIELD) };
  });
}
async function readOperation(git) {
  const [merge2, rebase, rebaseApply, cherry, revert] = await Promise.all([
    git("rev-parse", ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], [0, 1, 128]),
    git("rev-parse", ["rev-parse", "--git-path", "rebase-merge"], [0, 128]),
    git("rev-parse", ["rev-parse", "--git-path", "rebase-apply"], [0, 128]),
    git("rev-parse", ["rev-parse", "--verify", "--quiet", "CHERRY_PICK_HEAD"], [0, 1, 128]),
    git("rev-parse", ["rev-parse", "--verify", "--quiet", "REVERT_HEAD"], [0, 1, 128])
  ]);
  if (merge2.exitCode === 0) return "merge";
  if (await exists(rebase.stdout) || await exists(rebaseApply.stdout)) return "rebase";
  if (cherry.exitCode === 0) return "cherry-pick";
  if (revert.exitCode === 0) return "revert";
  return null;
}
async function exists(path) {
  const target = path.trim();
  if (target.length === 0) return false;
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
async function readUpstream(git) {
  const name2 = await git("upstream", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], [0, 128]);
  const tracked = name2.exitCode === 0 ? parseName(name2.stdout) : null;
  if (tracked === null) return null;
  const counts = await git("rev-list", ["rev-list", "--left-right", "--count", `HEAD...${tracked}`], [0, 128]);
  if (counts.exitCode !== 0) return { name: tracked, ahead: 0, behind: 0 };
  const [ahead = "0", behind = "0"] = counts.stdout.trim().split(/\s+/);
  return { name: tracked, ahead: Number(ahead) || 0, behind: Number(behind) || 0 };
}
function lines(output) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}
function parseCommit(record) {
  const [sha = "", short = "", subject = "", author = "", when = "", decorations = ""] = record.split(FIELD);
  return { sha, short, subject, author, when, refs: refsOf(decorations) };
}
function refsOf(decorations) {
  return decorations.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0).map((entry) => entry.startsWith(DECORATION_PREFIX) ? entry.slice(DECORATION_PREFIX.length) : entry);
}
function clamp(value, min, max) {
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
}

// src/host/status.ts
var NoRepository = class extends Error {
  name = "NoRepository";
  constructor(message = "the directory is not inside a Git checkout") {
    super(message);
  }
};
var NOT_A_CHECKOUT = /not a git repository|must be run in a work tree/i;
var UNAVAILABLE_IDENTITY = { name: null, email: null };
async function readStatus(ctx, config, session, directory, signal) {
  const root = await topLevel(gitIn(ctx, config, session, directory, signal));
  const git = gitIn(ctx, config, session, root, signal);
  const [status, branch, commit, identity, upstream, operation] = await Promise.all([
    git("status", ["status", "--porcelain=v2", "-z", "--untracked-files=all"]),
    git("symbolic-ref", ["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1, 128]),
    git("rev-parse", ["rev-parse", "--short", "HEAD"], [0, 128]),
    readIdentity(git),
    readUpstream(git),
    readOperation(git)
  ]);
  const parsed = parseStatus(status.stdout, status.truncated);
  return {
    kind: "repository",
    branch: branch.exitCode === 0 ? parseName(branch.stdout) : null,
    commit: commit.exitCode === 0 ? parseName(commit.stdout) : null,
    root,
    staged: parsed.staged,
    unstaged: parsed.unstaged,
    conflicts: parsed.conflicts,
    identity,
    upstream,
    operation
  };
}
async function topLevel(git) {
  const top = await git("rev-parse", ["rev-parse", "--show-toplevel"], [0, 128]);
  if (top.exitCode !== 0) {
    if (NOT_A_CHECKOUT.test(top.stderr)) throw new NoRepository();
    throw new GitFailure("rev-parse", top.exitCode, top.stderr);
  }
  const root = parseTopLevel(top.stdout);
  if (root.length === 0) throw new GitFailure("rev-parse", 0, "git rev-parse printed no directory");
  return root;
}
async function readIdentity(git) {
  const [name2, email] = await Promise.all([
    git("config", ["config", "--get", "user.name"], [0, 1]),
    git("config", ["config", "--get", "user.email"], [0, 1])
  ]);
  return { name: valueOf(name2.exitCode, name2.stdout), email: valueOf(email.exitCode, email.stdout) };
}
function valueOf(exitCode, stdout) {
  if (exitCode !== 0) return null;
  const value = stdout.trim();
  return value.length === 0 ? null : value;
}
function unavailable(problem, message) {
  return {
    kind: "unavailable",
    problem,
    staged: [],
    unstaged: [],
    conflicts: [],
    identity: UNAVAILABLE_IDENTITY,
    ...message === void 0 ? {} : { message }
  };
}
function messageOf(error) {
  if (error instanceof GitFailure) return firstLine(error.stderr);
  return error instanceof Error ? error.message : String(error);
}

// src/host/diff.ts
var DIFF_FLAGS = ["--no-color", "--no-ext-diff", "-U3"];
var MAX_CAPTURE_BYTES = 67108864;
function captureBytes(maxDiffBytes) {
  return Math.min(maxDiffBytes * 2, MAX_CAPTURE_BYTES);
}
async function readDiff(ctx, config, session, directory, request, signal) {
  if (!insideCheckout(request.path)) return { kind: "error", message: "the path is not a repository-relative path" };
  try {
    const root = await topLevel(gitIn(ctx, config, session, directory, signal));
    const git = gitIn(ctx, { ...config, maxOutputBytes: captureBytes(config.maxDiffBytes) }, session, root, signal);
    const side = request.staged ? ["--staged"] : [];
    const stat2 = await git("diff", ["diff", "--numstat", "-z", ...side, "--", request.path]);
    if (isBinary(parseNumstat(stat2.stdout))) return { kind: "binary" };
    const patch = await git("diff", ["diff", ...DIFF_FLAGS, ...side, "--", request.path]);
    return text(patch.stdout, patch.truncated, config.maxDiffBytes);
  } catch (error) {
    if (error instanceof GitFailure) return { kind: "error", message: firstLine(error.stderr) };
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}
function text(output, lossy, maxBytes) {
  if (lossy) return { kind: "text", hunks: [], truncated: true };
  const bytes = Buffer.from(output, "utf8");
  if (bytes.byteLength <= maxBytes) return { kind: "text", hunks: parsePatch(output) };
  return { kind: "text", hunks: parsePatch(bytes.subarray(0, maxBytes).toString("utf8")), truncated: true };
}
function insideCheckout(path) {
  if (path.length === 0 || path.includes("\0") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
  return path.split(/[/\\]/).every((segment) => segment !== "..");
}

// src/host/write.ts
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
async function write2(git, kind, request) {
  switch (kind) {
    case "stage":
      await git("add", ["add", "-A", "--", ...request.paths]);
      return;
    case "unstage":
      if (await hasHead(git)) await git("restore", ["restore", "--staged", "--", ...request.paths]);
      else await git("rm", ["rm", "--cached", "--", ...request.paths]);
      return;
    case "discard": {
      const tracked = await trackedPaths(git, request.paths);
      if (tracked.length > 0) await git("restore", ["restore", "--", ...tracked]);
      if (request.includeUntracked) await git("clean", ["clean", "-fd", "--", ...request.paths]);
      return;
    }
  }
}
async function hasHead(git) {
  const head = await git("rev-parse", ["rev-parse", "--verify", "--quiet", "HEAD"], [0, 1, 128]);
  return head.exitCode === 0;
}
async function trackedPaths(git, paths) {
  const listed = await git("ls-files", ["ls-files", "-z", "--cached", "--", ...paths]);
  const known = new Set(listed.stdout.split("\0").filter((path) => path.length > 0));
  return paths.filter((path) => known.has(path));
}
async function hasStagedChanges(git) {
  const diff = await git("diff", ["diff", "--cached", "--quiet"], [0, 1]);
  return diff.exitCode === 1;
}
async function commitStaged(git, message) {
  const file = join(
    tmpdir(),
    `dsh-git-sidebar-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
  );
  await writeFile(file, message, "utf8");
  try {
    await git("commit", ["commit", "-F", file]);
  } finally {
    await rm(file, { force: true });
  }
  const head = await git("rev-parse", ["rev-parse", "--short", "HEAD"], [0, 128]);
  const [commit] = head.stdout.split(/\r?\n/);
  return head.exitCode === 0 && commit !== void 0 && commit.length > 0 ? commit : null;
}

// src/host/service.ts
var REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
var GitSidebarService = class extends TypertRemoteService {
  home;
  config;
  constructor(ctx, config) {
    super(ctx, "gitSidebar");
    this.home = ctx;
    this.config = config;
  }
  /**
   * Read the Session's repository snapshot; never throws for a Git or lookup failure.
   * @param args - the Session whose checkout to read.
   * @returns the snapshot, or the reason the panel cannot show one.
   */
  async status(args) {
    const session = this.sessionOf(args?.sessionId);
    if (session === void 0) return unavailable("no-directory");
    const directory = this.directoryOf(session);
    if (directory === void 0) return unavailable("no-directory");
    return await this.snapshot(session, directory);
  }
  /**
   * Read one file's patch on one side of the index.
   * @param args - the Session, the path, and which side to read.
   * @returns the hunks, a binary notice, or the reason they are unavailable.
   */
  async diff(args) {
    const session = this.sessionOf(args?.sessionId);
    if (session === void 0 || typeof args?.path !== "string") {
      return { kind: "error", message: "diff requires a session and a path" };
    }
    const directory = this.directoryOf(session);
    if (directory === void 0) return { kind: "error", message: "the session has no working directory" };
    return await readDiff(
      this.home,
      this.config,
      session,
      directory,
      { path: args.path, staged: args.staged === true },
      this.signalOf()
    );
  }
  /**
   * Read one page of the commit history.
   * @param args - the Session, the page size, and the offset.
   * @returns the page, or an empty one when the Session has no checkout.
   */
  async history(args) {
    const target = this.targetOf(args?.sessionId);
    if (target === void 0) return { commits: [], hasMore: false };
    try {
      return await readHistory(this.home, this.config, target.session, target.directory, {
        sessionId: target.session.id,
        limit: typeof args?.limit === "number" ? args.limit : 20,
        skip: typeof args?.skip === "number" ? args.skip : 0
      }, this.signalOf());
    } catch {
      return { commits: [], hasMore: false };
    }
  }
  /**
   * Read one commit's own patch.
   * @param args - the Session and the commit to show.
   * @returns the patch, or the reason it is unavailable.
   */
  async commitDetail(args) {
    const target = this.targetOf(args?.sessionId);
    if (target === void 0 || typeof args?.sha !== "string") {
      return { kind: "error", message: "commitDetail requires a session and a commit" };
    }
    return await readCommitDiff(this.home, this.config, target.session, target.directory, {
      sessionId: target.session.id,
      sha: args.sha
    }, this.signalOf());
  }
  /**
   * List the branches the Session's checkout offers.
   * @param args - the Session.
   * @returns the checked-out branch and both ref groups.
   */
  async branches(args) {
    const target = this.targetOf(args?.sessionId);
    if (target === void 0) return { current: null, local: [], remote: [] };
    try {
      return await readBranches(this.home, this.config, target.session, target.directory, this.signalOf());
    } catch {
      return { current: null, local: [], remote: [] };
    }
  }
  /**
   * Switch the checkout to an existing local branch.
   * @param args - the Session and the branch.
   * @returns the new snapshot, or the refusal.
   */
  async checkout(args) {
    const branch = typeof args?.branch === "string" ? args.branch.trim() : "";
    if (branch.length === 0) return { ok: false, problem: "no-paths", message: "checkout needs a branch" };
    return await this.writeWith(args?.sessionId, async (git, session, directory) => {
      const listed = await readBranches(this.home, this.config, session, directory, this.signalOf());
      if (!listed.local.includes(branch)) {
        return { ok: false, problem: "invalid-name", message: `no local branch is named ${branch}` };
      }
      if (await hasTrackedChanges(git)) {
        return { ok: false, problem: "dirty", message: "the working tree has changes a checkout would lose" };
      }
      await checkout(git, branch);
      return null;
    });
  }
  /**
   * Create a branch and switch to it.
   * @param args - the Session, the new name, and the start point.
   * @returns the new snapshot, or the refusal.
   */
  async createBranch(args) {
    const name2 = typeof args?.name === "string" ? args.name.trim() : "";
    if (name2.length === 0) return { ok: false, problem: "no-paths", message: "a branch needs a name" };
    const from2 = typeof args?.from === "string" && args.from.trim().length > 0 ? args.from.trim() : void 0;
    return await this.writeWith(args?.sessionId, async (git, session, directory) => {
      if (!await isValidBranchName(git, name2)) {
        return { ok: false, problem: "invalid-name", message: `${name2} is not a valid branch name` };
      }
      const listed = await readBranches(this.home, this.config, session, directory, this.signalOf());
      if (listed.local.includes(name2)) {
        return { ok: false, problem: "exists", message: `a branch named ${name2} already exists` };
      }
      if (await hasTrackedChanges(git)) {
        return { ok: false, problem: "dirty", message: "the working tree has changes a checkout would lose" };
      }
      await createBranch(git, name2, from2);
      return null;
    });
  }
  /**
   * List the stash entries of the Session's checkout.
   * @param args - the Session.
   * @returns the entries, newest first.
   */
  async stashes(args) {
    const target = this.targetOf(args?.sessionId);
    if (target === void 0) return [];
    try {
      return await readStashes(this.home, this.config, target.session, target.directory, this.signalOf());
    } catch {
      return [];
    }
  }
  /**
   * Store the working tree in a new stash entry.
   * @param args - the Session and the optional message.
   * @returns the new snapshot, or the refusal.
   */
  async stash(args) {
    const message = typeof args?.message === "string" ? args.message : void 0;
    return await this.writeWith(args?.sessionId, async (git) => {
      await stashPush(git, message);
      return null;
    });
  }
  /**
   * Apply or pop one stash entry.
   * @param args - the Session, the entry's index, and whether to remove it.
   * @returns the new snapshot, or the refusal.
   */
  async stashApply(args) {
    if (!validStashIndex(args?.index)) {
      return { ok: false, problem: "invalid-name", message: "the stash index is not a possible entry" };
    }
    const index = args.index;
    const drop = args.drop === true;
    return await this.writeWith(args?.sessionId, async (git) => {
      await stashApply(git, index, drop);
      return null;
    });
  }
  /**
   * Run one network operation against the branch's upstream.
   * @param args - the Session and which operation to run.
   * @returns the new snapshot, or the refusal.
   */
  async sync(args) {
    if (!isSyncAction(args?.action)) {
      return { ok: false, problem: "failed", message: "sync needs fetch, pull, or push" };
    }
    const action = args.action;
    return await this.writeWith(args?.sessionId, async (git, session, directory) => {
      const network = gitIn(
        this.home,
        { ...this.config, timeoutMs: this.config.syncTimeoutMs },
        session,
        directory,
        this.signalOf()
      );
      await sync(network, action);
      return null;
    });
  }
  /**
   * Stage every change of the given paths.
   * @param args - the Session and the paths to stage.
   * @returns the new snapshot, or the refusal.
   */
  async stage(args) {
    return await this.applyWrite("stage", args?.sessionId, args?.paths, false);
  }
  /**
   * Remove every change of the given paths from the index.
   * @param args - the Session and the paths to unstage.
   * @returns the new snapshot, or the refusal.
   */
  async unstage(args) {
    return await this.applyWrite("unstage", args?.sessionId, args?.paths, false);
  }
  /**
   * Restore the given paths from the index, optionally removing untracked files.
   * @param args - the Session, the paths, and whether untracked files go too.
   * @returns the new snapshot, or the refusal.
   */
  async discard(args) {
    return await this.applyWrite("discard", args?.sessionId, args?.paths, args?.includeUntracked === true);
  }
  /**
   * Commit the index with the given message.
   * @param args - the Session and the commit message.
   * @returns the new commit and snapshot, or the refusal.
   */
  async commit(args) {
    const session = this.sessionOf(args?.sessionId);
    const directory = session === void 0 ? void 0 : this.directoryOf(session);
    if (session === void 0 || directory === void 0) {
      return { ok: false, problem: "failed", message: "the session has no working directory" };
    }
    const message = typeof args?.message === "string" ? args.message.trim() : "";
    if (message.length === 0) return { ok: false, problem: "empty-message", message: "a commit needs a message" };
    try {
      const root = await this.rootOf(session, directory);
      const git = gitIn(this.home, this.config, session, root, this.signalOf());
      const identity = await readIdentity(git);
      if (identity.name === null || identity.email === null) {
        return {
          ok: false,
          problem: "identity-missing",
          message: "set user.name and user.email before committing"
        };
      }
      if (!await hasStagedChanges(git)) {
        return { ok: false, problem: "nothing-staged", message: "the index holds no change to commit" };
      }
      const commit = await commitStaged(git, message);
      return { ok: true, commit, snapshot: await this.snapshot(session, root) };
    } catch (error) {
      return { ok: false, problem: "failed", message: messageOf(error) };
    }
  }
  /** Run one staging write and report the new snapshot. */
  async applyWrite(kind, sessionId, paths, includeUntracked) {
    const wanted = Array.isArray(paths) ? paths.filter((path) => typeof path === "string") : [];
    if (wanted.length === 0) return { ok: false, problem: "no-paths", message: "no paths were given" };
    return await this.writeWith(sessionId, async (git) => {
      await write2(git, kind, { paths: wanted, includeUntracked });
      return null;
    });
  }
  /**
   * Run one write behind the shared Session, root, and failure handling.
   *
   * A helper that returns a refusal keeps it; one that returns null succeeded,
   * and the outcome then carries the snapshot this read produced.
   * @param sessionId - the Session from the wire.
   * @param action - the Git work to perform.
   * @returns the new snapshot, or the refusal.
   */
  async writeWith(sessionId, action) {
    const target = this.targetOf(sessionId);
    if (target === void 0) {
      return { ok: false, problem: "failed", message: "the session has no working directory" };
    }
    try {
      const root = await this.rootOf(target.session, target.directory);
      const refusal = await action(
        gitIn(this.home, this.config, target.session, root, this.signalOf()),
        target.session,
        root
      );
      if (refusal !== null) return refusal;
      return { ok: true, snapshot: await this.snapshot(target.session, root) };
    } catch (error) {
      return { ok: false, problem: "failed", message: messageOf(error) };
    }
  }
  /** Resolve a Session and its directory together, for the read endpoints that need both. */
  targetOf(sessionId) {
    const session = this.sessionOf(sessionId);
    if (session === void 0) return void 0;
    const directory = this.directoryOf(session);
    return directory === void 0 ? void 0 : { session, directory };
  }
  /** Read a snapshot, folding every failure into the unavailable shape. */
  async snapshot(session, directory) {
    try {
      return await readStatus(this.home, this.config, session, directory, this.signalOf());
    } catch (error) {
      if (error instanceof NoRepository) return unavailable("no-repository");
      if (error instanceof GitMissingError) return unavailable("git-missing", messageOf(error));
      return unavailable("failed", messageOf(error));
    }
  }
  async rootOf(session, directory) {
    const snapshot2 = await this.snapshot(session, directory);
    if (snapshot2.kind === "repository" && snapshot2.root !== void 0) return snapshot2.root;
    throw new Error(snapshot2.message ?? "the session has no Git repository");
  }
  /** Resolve one Session id from the wire; an unknown id reads as no Session. */
  sessionOf(sessionId) {
    if (typeof sessionId !== "string" || sessionId.length === 0) return void 0;
    try {
      return this.home.sessions.get(sessionId);
    } catch {
      return void 0;
    }
  }
  /** Read one Session's directory, or undefined when it has none. */
  directoryOf(session) {
    try {
      const directory = this.home.workingDirectory.get(session);
      return typeof directory === "string" && directory.length > 0 ? directory : void 0;
    } catch {
      return void 0;
    }
  }
  /** Cancellation of the Remote call this method runs in, or an unabortable signal outside one. */
  signalOf() {
    return this.home.invocation?.signal ?? new AbortController().signal;
  }
};
Object.defineProperty(GitSidebarService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze(REMOTE_METHODS.map((method) => Object.freeze({ method, invocation: Object.freeze({ kind: "direct" }) })))
  })
});

// src/index.ts
var name = "@dsh-plugin/dsh-git-sidebar";
var inject = ["subprocess", "sandbox", "sandboxPolicy", "workingDirectory", "sessions"];
var Config = Schema.object({
  gitCommand: Schema.string().default("git").description("Git executable name or absolute path."),
  timeoutMs: Schema.number().min(1e3).max(12e4).default(15e3).description("Deadline for one git command."),
  syncTimeoutMs: Schema.number().min(5e3).max(6e5).default(6e4).description("Deadline for one network command such as fetch, pull, or push."),
  maxOutputBytes: Schema.number().min(65536).max(67108864).default(4194304).description("Largest captured stdout or stderr per command."),
  graceMs: Schema.number().min(0).max(3e4).default(2e3).description("Termination grace for each process."),
  maxDiffBytes: Schema.number().min(65536).max(16777216).default(1048576).description("Largest patch the diff viewer renders before truncating.")
});
function apply(ctx, config) {
  const resolved = config ?? Config({});
  if (typeof resolved.gitCommand !== "string" || resolved.gitCommand.trim().length === 0) {
    throw new Error("git-sidebar: gitCommand must not be empty");
  }
  new GitSidebarService(ctx, resolved);
}
export {
  Config,
  apply,
  inject,
  name
};
