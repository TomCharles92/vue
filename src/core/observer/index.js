/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer 类附加到了每个响应式对象。
 * 将目标对象的 property 转换为 get/set，用于收集依赖和发布更新
 */
/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  // 观测对象
  value: any;
  // 依赖对象
  dep: Dep;
  // 实例计数器
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    // 将当前 observer 实例挂载到 value.__ob__ 上面
    def(value, '__ob__', this)
    if (Array.isArray(value)) {
      /**
       * 这一块的代码作用是：
       * 对于 push、pop 等会修改数组自身的方法，拦截这些方法的执行过程，在其中加入了：
       * 1. 对于新增的元素做响应式处理
       * 2. dep.notify()
       */
      // 判断兼容性，是否支持 __proto__
      if (hasProto) {
        // value.__proto__ => arrayMethods，arrayMethods 保存了修改过的数组方法
        // arrayMethods.__proto__ => Array.prototype
        protoAugment(value, arrayMethods)
      } else {
        // 手动添加原型方法
        copyAugment(value, arrayMethods, arrayKeys)
      }
      // 为数组中的每一个对象创建一个 observer 实例
      this.observeArray(value)
    } else {
      // 遍历对象中的每一个属性，转换为 get/set
      this.walk(value)
    }
  }

  // 如果 value 是对象，将它的属性也转换为 get/set
  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  // 将数组元素处理为响应式
  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * 尝试用 value 创建一个 observer 实例
 * 返回一个新实例或已存在的实例
 */
/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  // 初始化一个响应式实例
  let ob: Observer | void
  // value 有 __ob__ 属性 && value 是响应式实例
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if ( // 判断 value 是否可以进行响应式地处理
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) && // (value 是数组 || value 是JS对象)
    Object.isExtensible(value) &&
    !value._isVue // value 不是 _isVue。_isVue 是 Vue 实例，表示已经响应式处理了
  ) {
    ob = new Observer(value)
  }
  // asRootData 表示根数据，似乎意味着 value => options.data，表示来源
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

// 为一个对象定义响应式属性
/**
 * Define a reactive property on an Object.
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean // 只监听第一层属性
) {
  // 创建依赖对象实例
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // 这块不太明白
  // 把 get/set 函数取出来，如果已经定义过了，方便后面重新定义
  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  // （没有get || 有set）&& 参数是2个：设置 val 的值
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 不是浅处理 && 响应式处理 val
  // 判断是否递归观察子对象，并将子对象都转成 get/set，返回子观察对象
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      // 已经定义过 get，则用 getter.call(obj) 获取 val
      const value = getter ? getter.call(obj) : val
      /**
       * 这块代码是收集依赖用的
       * 如果存在当前依赖目标，即 watcher 对象，则建立依赖
       */
      // target 就是 watcher 对象
      if (Dep.target) {
        // 每个属性 obj[key] 都会创建自己的 dep 对象，用于收集依赖
        // 将 watcher 对象添加到 subs 数组中
        dep.depend()
        // 如果子观察目标存在，建立子对象的依赖关系
        if (childOb) {
          // 子observer对象收集依赖
          childOb.dep.depend()
          // 这里是 子对象的属性 为数组的情况，当前属性为数组在哪处理？
          // 如果属性是数组，则特殊处理手机数组对象依赖
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      // || 用于处理 NaN
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // 有 get || 没有 set
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 如果 newVal 是一个对象，则要响应式处理
      // 记录子 observer 对象到 childOb
      childOb = !shallow && observe(newVal)
      // 发布通知
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
