(function(){

var api = mapshaper; // assuming mapshaper is in global scope
var utils = api.utils;
var cli = api.cli;
var geom = api.geom;
var internal = api.internal;
var Bounds = api.internal.Bounds;
var APIError = api.internal.APIError;
var message = api.internal.message;


function Handler(type, target, callback, listener, priority) {
  this.type = type;
  this.callback = callback;
  this.listener = listener || null;
  this.priority = priority || 0;
  this.target = target;
}

Handler.prototype.trigger = function(evt) {
  if (!evt) {
    evt = new EventData(this.type);
    evt.target = this.target;
  } else if (evt.target != this.target || evt.type != this.type) {
    error("[Handler] event target/type have changed.");
  }
  this.callback.call(this.listener, evt);
}

function EventData(type, target, data) {
  this.type = type;
  this.target = target;
  if (data) {
    utils.defaults(this, data);
    this.data = data;
  }
}

EventData.prototype.stopPropagation = function() {
  this.__stop__ = true;
};

//  Base class for objects that dispatch events
function EventDispatcher() {}


// @obj (optional) data object, gets mixed into event
// @listener (optional) dispatch event only to this object
EventDispatcher.prototype.dispatchEvent = function(type, obj, listener) {
  var evt;
  // TODO: check for bugs if handlers are removed elsewhere while firing
  var handlers = this._handlers;
  if (handlers) {
    for (var i = 0, len = handlers.length; i < len; i++) {
      var handler = handlers[i];
      if (handler.type == type && (!listener || listener == handler.listener)) {
        if (!evt) {
          evt = new EventData(type, this, obj);
        }
        else if (evt.__stop__) {
            break;
        }
        handler.trigger(evt);
      }
    }
  }
};

EventDispatcher.prototype.addEventListener =
EventDispatcher.prototype.on = function(type, callback, context, priority) {
  context = context || this;
  priority = priority || 0;
  var handler = new Handler(type, this, callback, context, priority);
  // Insert the new event in the array of handlers according to its priority.
  var handlers = this._handlers || (this._handlers = []);
  var i = handlers.length;
  while (--i >= 0 && handlers[i].priority < handler.priority) {}
  handlers.splice(i+1, 0, handler);
  return this;
};

// Remove an event handler.
// @param {string} type Event type to match.
// @param {function(BoundEvent)} callback Event handler function to match.
// @param {*=} context Execution context of the event handler to match.
// @return {number} Returns number of handlers removed (expect 0 or 1).
EventDispatcher.prototype.removeEventListener = function(type, callback, context) {
  context = context || this;
  var count = this.removeEventListeners(type, callback, context);
  return count;
};

// Remove event handlers; passing arguments can limit which listeners to remove
// Returns nmber of handlers removed.
EventDispatcher.prototype.removeEventListeners = function(type, callback, context) {
  var handlers = this._handlers;
  var newArr = [];
  var count = 0;
  for (var i = 0; handlers && i < handlers.length; i++) {
    var evt = handlers[i];
    if ((!type || type == evt.type) &&
      (!callback || callback == evt.callback) &&
      (!context || context == evt.listener)) {
      count += 1;
    }
    else {
      newArr.push(evt);
    }
  }
  this._handlers = newArr;
  return count;
};

EventDispatcher.prototype.countEventListeners = function(type) {
  var handlers = this._handlers,
    len = handlers && handlers.length || 0,
    count = 0;
  if (!type) return len;
  for (var i = 0; i < len; i++) {
    if (handlers[i].type === type) count++;
  }
  return count;
};



var Env = (function() {
  var inNode = typeof module !== 'undefined' && !!module.exports;
  var inBrowser = typeof window !== 'undefined' && !inNode;
  var inPhantom = inBrowser && !!(window.phantom && window.phantom.exit);
  var ieVersion = inBrowser && /MSIE ([0-9]+)/.exec(navigator.appVersion) && parseInt(RegExp.$1) || NaN;

  return {
    iPhone : inBrowser && !!(navigator.userAgent.match(/iPhone/i)),
    iPad : inBrowser && !!(navigator.userAgent.match(/iPad/i)),
    canvas: inBrowser && !!document.createElement('canvas').getContext,
    inNode : inNode,
    inPhantom : inPhantom,
    inBrowser: inBrowser,
    ieVersion: ieVersion,
    ie: !isNaN(ieVersion)
  };
})();


var Browser = {
  getPageXY: function(el) {
    var x = 0, y = 0;
    if (el.getBoundingClientRect) {
      var box = el.getBoundingClientRect();
      x = box.left - Browser.pageXToViewportX(0);
      y = box.top - Browser.pageYToViewportY(0);
    }
    else {
      var fixed = Browser.elementIsFixed(el);

      while (el) {
        x += el.offsetLeft || 0;
        y += el.offsetTop || 0;
        el = el.offsetParent;
      }

      if (fixed) {
        var offsX = -Browser.pageXToViewportX(0);
        var offsY = -Browser.pageYToViewportY(0);
        x += offsX;
        y += offsY;
      }
    }

    var obj = {x:x, y:y};
    return obj;
  },

  elementIsFixed: function(el) {
    // get top-level offsetParent that isn't body (cf. Firefox)
    var body = document.body;
    while (el && el != body) {
      var parent = el;
      el = el.offsetParent;
    }

    // Look for position:fixed in the computed style of the top offsetParent.
    // var styleObj = parent && (parent.currentStyle || window.getComputedStyle && window.getComputedStyle(parent, '')) || {};
    var styleObj = parent && Browser.getElementStyle(parent) || {};
    return styleObj['position'] == 'fixed';
  },

  pageXToViewportX: function(x) {
    return x - window.pageXOffset;
  },

  pageYToViewportY: function(y) {
    return y - window.pageYOffset;
  },

  getElementStyle: function(el) {
    return el.currentStyle || window.getComputedStyle && window.getComputedStyle(el, '') || {};
  },

  getClassNameRxp: function(cname) {
    return new RegExp("(^|\\s)" + cname + "(\\s|$)");
  },

  hasClass: function(el, cname) {
    var rxp = this.getClassNameRxp(cname);
    return el && rxp.test(el.className);
  },

  addClass: function(el, cname) {
    var classes = el.className;
    if (!classes) {
      classes = cname;
    }
    else if (!this.hasClass(el, cname)) {
      classes = classes + ' ' + cname;
    }
    el.className = classes;
  },

  removeClass: function(el, cname) {
    var rxp = this.getClassNameRxp(cname);
    el.className = el.className.replace(rxp, "$2");
  },

  replaceClass: function(el, c1, c2) {
    var r1 = this.getClassNameRxp(c1);
    el.className = el.className.replace(r1, '$1' + c2 + '$2');
  },

  mergeCSS: function(s1, s2) {
    var div = this._cssdiv;
    if (!div) {
      div = this._cssdiv = document.createElement('div');
    }
    div.style.cssText = s1 + ";" + s2; // extra ';' for ie, which may leave off final ';'
    return div.style.cssText;
  },

  addCSS: function(el, css) {
    el.style.cssText = Browser.mergeCSS(el.style.cssText, css);
  },

  // Return: HTML node reference or null
  // Receive: node reference or id or "#" + id
  getElement: function(ref) {
    var el;
    if (typeof ref == 'string') {
      if (ref.charAt(0) == '#') {
        ref = ref.substr(1);
      }
      if (ref == 'body') {
        el = document.getElementsByTagName('body')[0];
      }
      else {
        el = document.getElementById(ref);
      }
    }
    else if (ref && ref.nodeType !== void 0) {
      el = ref;
    }
    return el || null;
  },

  undraggable: function(el) {
    el.ondragstart = function(){return false;};
    el.draggable = false;
  }

};

Browser.onload = function(handler) {
  if (document.readyState == 'complete') {
    handler();
  } else {
    window.addEventListener('load', handler);
  }
};


// See https://github.com/janl/mustache.js/blob/master/mustache.js
utils.htmlEscape = (function() {
  var entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;'
  };
  return function(s) {
    return String(s).replace(/[&<>"'\/]/g, function(s) {
      return entityMap[s];
    });
  };
}());


var classSelectorRE = /^\.([\w-]+)$/,
    idSelectorRE = /^#([\w-]+)$/,
    tagSelectorRE = /^[\w-]+$/,
    tagOrIdSelectorRE = /^#?[\w-]+$/;

function Elements(sel) {
  if ((this instanceof Elements) == false) {
    return new Elements(sel);
  }
  this.elements = [];
  this.select(sel);
}

Elements.prototype = {
  size: function() {
    return this.elements.length;
  },

  select: function(sel) {
    this.elements = Elements.__select(sel);
    return this;
  },

  addClass: function(className) {
    this.forEach(function(el) { el.addClass(className); });
    return this;
  },

  removeClass: function(className) {
    this.forEach(function(el) { el.removeClass(className); })
    return this;
  },

  forEach: function(callback, ctx) {
    for (var i=0, len=this.elements.length; i<len; i++) {
      callback.call(ctx, El(this.elements[i]), i);
    }
    return this;
  }
};

Elements.__select = function(selector, root) {
  root = root || document;
  var els;
  if (classSelectorRE.test(selector)) {
    els = Elements.__getElementsByClassName(RegExp.$1, root);
  }
  else if (tagSelectorRE.test(selector)) {
    els = root.getElementsByTagName(selector);
  }
  else if (document.querySelectorAll) {
    try {
      els = root.querySelectorAll(selector)
    } catch (e) {
      error("Invalid selector:", selector);
    }
  } else {
    error("This browser doesn't support CSS query selectors");
  }
  return utils.toArray(els);
}

Elements.__getElementsByClassName = function(cname, node) {
  if (node.getElementsByClassName) {
    return node.getElementsByClassName(cname);
  }
  var a = [];
  var re = new RegExp('(^| )'+cname+'( |$)');
  var els = node.getElementsByTagName("*");
  for (var i=0, j=els.length; i<j; i++)
    if (re.test(els[i].className)) a.push(els[i]);
  return a;
};

// Converts dash-separated names (e.g. background-color) to camelCase (e.g. backgroundColor)
// Doesn't change names that are already camelCase
//
El.toCamelCase = function(str) {
  var cc = str.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase() });
  return cc;
};

El.fromCamelCase = function(str) {
  var dashed = str.replace(/([A-Z])/g, "-$1").toLowerCase();
  return dashed;
};

El.setStyle = function(el, name, val) {
  var jsName = El.toCamelCase(name);
  if (el.style[jsName] == void 0) {
    trace("[Element.setStyle()] css property:", jsName);
    return;
  }
  var cssVal = val;
  if (isFinite(val)) {
    cssVal = String(val); // problem if converted to scientific notation
    if (jsName != 'opacity' && jsName != 'zIndex') {
      cssVal += "px";
    }
  }
  el.style[jsName] = cssVal;
}

El.findAll = function(sel, root) {
  return Elements.__select(sel, root);
};

function El(ref) {
  if (!ref) error("Element() needs a reference");
  if (ref instanceof El) {
    return ref;
  }
  else if (this instanceof El === false) {
    return new El(ref);
  }

  var node;
  if (utils.isString(ref)) {
    if (El.isHTML(ref)) {
      var parent = El('div').html(ref).node();
      node = parent.childNodes.length  == 1 ? parent.childNodes[0] : parent;
    } else if (tagOrIdSelectorRE.test(ref)) {
      node = Browser.getElement(ref) || document.createElement(ref); // TODO: detect type of argument
    } else {
      node = Elements.__select(ref)[0];
    }
  } else if (ref.tagName) {
    node = ref;
  }
  if (!node) error("Unmatched element selector:", ref);
  this.el = node;
}

utils.inherit(El, EventDispatcher); //

El.removeAll = function(sel) {
  var arr = Elements.__select(sel);
  utils.forEach(arr, function(el) {
    El(el).remove();
  });
};

El.isHTML = function(str) {
  return str && str[0] == '<'; // TODO: improve
};

utils.extend(El.prototype, {

  clone: function() {
    var el = this.el.cloneNode(true);
    if (el.nodeName == 'SCRIPT') {
      // Assume scripts are templates and convert to divs, so children
      //    can
      el = El('div').addClass(el.className).html(el.innerHTML).node();
    }
    el.id = utils.getUniqueName();
    this.el = el;
    return this;
  },

  node: function() {
    return this.el;
  },

  width: function() {
   return this.el.offsetWidth;
  },

  height: function() {
    return this.el.offsetHeight;
  },

  top: function() {
    return this.el.offsetTop;
  },

  left: function() {
    return this.el.offsetLeft;
  },

  // Apply inline css styles to this Element, either as string or object.
  //
  css: function(css, val) {
    if (val != null) {
      El.setStyle(this.el, css, val);
    }
    else if (utils.isString(css)) {
      Browser.addCSS(this.el, css);
    }
    else if (utils.isObject(css)) {
      utils.forEachProperty(css, function(val, key) {
        El.setStyle(this.el, key, val);
      }, this);
    }
    return this;
  },

  attr: function(obj, value) {
    if (utils.isString(obj)) {
      if (arguments.length == 1) {
        return this.el.getAttribute(obj);
      }
      this.el[obj] = value;
    }
    else if (!value) {
      Opts.copyAllParams(this.el, obj);
    }
    return this;
  },


  remove: function(sel) {
    this.el.parentNode && this.el.parentNode.removeChild(this.el);
    return this;
  },

  addClass: function(className) {
    Browser.addClass(this.el, className);
    return this;
  },

  removeClass: function(className) {
    Browser.removeClass(this.el, className);
    return this;
  },

  classed: function(className, b) {
    this[b ? 'addClass' : 'removeClass'](className);
    return this;
  },

  hasClass: function(className) {
    return Browser.hasClass(this.el, className);
  },

  toggleClass: function(cname) {
    if (this.hasClass(cname)) {
      this.removeClass(cname);
    } else {
      this.addClass(cname);
    }
  },

  computedStyle: function() {
    return Browser.getElementStyle(this.el);
  },

  visible: function() {
    if (this._hidden !== undefined) {
      return !this._hidden;
    }
    var style = this.computedStyle();
    return style.display != 'none' && style.visibility != 'hidden';
  },

  showCSS: function(css) {
    if (!css) {
      return this._showCSS || "display:block;";
    }
    this._showCSS = css;
    return this;
  },

  hideCSS: function(css) {
    if (!css) {
      return this._hideCSS || "display:none;";
    }
    this._hideCSS = css;
    return this;
  },

  hide: function(css) {
    if (this.visible()) {
      this.css(css || this.hideCSS());
      this._hidden = true;
    }
    return this;
  },

  show: function(css) {
    if (!this.visible()) {
      this.css(css || this.showCSS());
      this._hidden = false;
    }
    return this;
  },

  html: function(html) {
    if (arguments.length == 0) {
      return this.el.innerHTML;
    } else {
      this.el.innerHTML = html;
      return this;
    }
  },

  text: function(str) {
    this.html(utils.htmlEscape(str));
    return this;
  },

  // Shorthand for attr('id', <name>)
  id: function(id) {
    if (id) {
      this.el.id = id;
      return this;
    }
    return this.el.id;
  },

  findChild: function(sel) {
    var node = Elements.__select(sel, this.el)[0];
    if (!node) error("Unmatched selector:", sel);
    return new El(node);
  },

  appendTo: function(ref) {
    var parent = ref instanceof El ? ref.el : Browser.getElement(ref);
    if (this._sibs) {
      for (var i=0, len=this._sibs.length; i<len; i++) {
        parent.appendChild(this._sibs[i]);
      }
    }
    parent.appendChild(this.el);
    return this;
  },

  nextSibling: function() {
    return this.el.nextSibling ? new El(this.el.nextSibling) : null;
  },

  newSibling: function(tagName) {
    var el = this.el,
        sib = document.createElement(tagName),
        e = new El(sib),
        par = el.parentNode;
    if (par) {
      el.nextSibling ? par.insertBefore(sib, el.nextSibling) : par.appendChild(sib);
    } else {
      e._sibs = this._sibs || [];
      e._sibs.push(el);
    }
    return e;
  },

  firstChild: function() {
    var ch = this.el.firstChild;
    while (ch.nodeType != 1) { // skip text nodes
      ch = ch.nextSibling;
    }
    return new El(ch);
  },

  appendChild: function(ref) {
    var el = El(ref);
    this.el.appendChild(el.el);
    return this;
  },

  newChild: function(tagName) {
    var ch = document.createElement(tagName);
    this.el.appendChild(ch);
    return new El(ch);
  },

  // Traverse to parent node
  parent: function() {
    var p = this.el && this.el.parentNode;
    return p ? new El(p) : null;
  },

  findParent: function(tagName) {
    var p = this.el && this.el.parentNode;
    if (tagName) {
      tagName = tagName.toUpperCase();
      while (p && p.tagName != tagName) {
        p = p.parentNode;
      }
    }
    return p ? new El(p) : null;
  },

  // Remove all children of this element
  //
  empty: function() {
    this.el.innerHTML = '';
    return this;
  }

});

// use DOM handler for certain events
// TODO: find a better way distinguising DOM events and other events registered on El
// e.g. different methods
//
//El.prototype.__domevents = utils.arrayToIndex("click,mousedown,mousemove,mouseup".split(','));
El.prototype.__on = El.prototype.on;
El.prototype.on = function(type, func, ctx) {
  if (ctx) {
    error("[El#on()] Third argument no longer supported.");
  }
  if (this.constructor == El) {
    this.el.addEventListener(type, func);
  } else {
    this.__on.apply(this, arguments);
  }
  return this;
};

El.prototype.__removeEventListener = El.prototype.removeEventListener;
El.prototype.removeEventListener = function(type, func) {
  if (this.constructor == El) {
    this.el.removeEventListener(type, func);
  } else {
    this.__removeEventListener.apply(this, arguments);
  }
  return this;
};


function ElementPosition(ref) {
  var self = this,
      el = El(ref),
      pageX = 0,
      pageY = 0,
      width = 0,
      height = 0;

  el.on('mouseover', update);
  window.onorientationchange && window.addEventListener('orientationchange', update);
  window.addEventListener('scroll', update);
  window.addEventListener('resize', update);

  // trigger an update, e.g. when map container is resized
  this.update = function() {
    update();
  };

  this.resize = function(w, h) {
    el.css('width', w).css('height', h);
    update();
  };

  this.width = function() { return width };
  this.height = function() { return height };
  this.position = function() {
    return {
      element: el.node(),
      pageX: pageX,
      pageY: pageY,
      width: width,
      height: height
    };
  };

  function update() {
    var div = el.node(),
        xy = Browser.getPageXY(div),
        w = div.clientWidth,
        h = div.clientHeight,
        x = xy.x,
        y = xy.y,
        resized = w != width || h != height,
        moved = x != pageX || y != pageY;
    if (resized || moved) {
      pageX = x, pageY = y, width = w, height = h;
      self.dispatchEvent('change', self.position());
      if (resized) {
        self.dispatchEvent('resize', self.position());
      }
    }
  }
  update();
}

utils.inherit(ElementPosition, EventDispatcher);


function getTimerFunction() {
  return typeof requestAnimationFrame == 'function' ?
    requestAnimationFrame : function(cb) {setTimeout(cb, 25);};
}

function Timer() {
  var self = this,
      running = false,
      busy = false,
      tickTime, startTime, duration;

  this.start = function(ms) {
    var now = +new Date();
    duration = ms || Infinity;
    startTime = now;
    running = true;
    if (!busy) startTick(now);
  };

  this.stop = function() {
    running = false;
  };

  function startTick(now) {
    busy = true;
    tickTime = now;
    getTimerFunction()(onTick);
  }

  function onTick() {
    var now = +new Date(),
        elapsed = now - startTime,
        pct = Math.min((elapsed + 10) / duration, 1),
        done = pct >= 1;
    if (!running) { // interrupted
      busy = false;
      return;
    }
    if (done) running = false;
    self.dispatchEvent('tick', {
      elapsed: elapsed,
      pct: pct,
      done: done,
      time: now,
      tickTime: now - tickTime
    });
    busy = false;
    if (running) startTick(now);
  }
}

utils.inherit(Timer, EventDispatcher);

function Tween(ease) {
  var self = this,
      timer = new Timer(),
      start, end;

  timer.on('tick', onTick);

  this.start = function(a, b, duration) {
    start = a;
    end = b;
    timer.start(duration || 500);
  };

  function onTick(e) {
    var pct = ease ? ease(e.pct) : e.pct,
        val = end * pct + start * (1 - pct);
    self.dispatchEvent('change', {value: val});
  }
}

utils.inherit(Tween, EventDispatcher);

Tween.sineInOut = function(n) {
  return 0.5 - Math.cos(n * Math.PI) / 2;
};

Tween.quadraticOut = function(n) {
  return 1 - Math.pow((1 - n), 2);
};


// @mouse: MouseArea object
function MouseWheel(mouse) {
  var self = this,
      prevWheelTime = 0,
      currDirection = 0,
      timer = new Timer().addEventListener('tick', onTick),
      sustainTime = 60,
      fadeTime = 80;

  if (window.onmousewheel !== undefined) { // ie, webkit
    window.addEventListener('mousewheel', handleWheel);
  } else { // firefox
    window.addEventListener('DOMMouseScroll', handleWheel);
  }

  function handleWheel(evt) {
    var direction;
    if (evt.wheelDelta) {
      direction = evt.wheelDelta > 0 ? 1 : -1;
    } else if (evt.detail) {
      direction = evt.detail > 0 ? -1 : 1;
    }
    if (!mouse.isOver() || !direction) return;
    evt.preventDefault();
    prevWheelTime = +new Date();
    if (!currDirection) {
      self.dispatchEvent('mousewheelstart');
    }
    currDirection = direction;
    timer.start(sustainTime + fadeTime);
  }

  function onTick(evt) {
    var elapsed = evt.time - prevWheelTime,
        fadeElapsed = elapsed - sustainTime,
        scale = evt.tickTime / 25,
        obj;
    if (evt.done) {
      currDirection = 0;
    } else {
      if (fadeElapsed > 0) {
        // Decelerate if the timer fires during 'fade time' (for smoother zooming)
        scale *= Tween.quadraticOut((fadeTime - fadeElapsed) / fadeTime);
      }
      obj = utils.extend({direction: currDirection, multiplier: scale}, mouse.mouseData());
      self.dispatchEvent('mousewheel', obj);
    }
  }
}

utils.inherit(MouseWheel, EventDispatcher);


function MouseArea(element) {
  var pos = new ElementPosition(element),
      _areaPos = pos.position(),
      _self = this,
      _dragging = false,
      _isOver = false,
      _prevEvt,
      // _moveEvt,
      _downEvt;

  pos.on('change', function() {_areaPos = pos.position()});
  // TODO: think about touch events
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  element.addEventListener('mouseover', onAreaEnter);
  element.addEventListener('mousemove', onAreaEnter);
  element.addEventListener('mouseout', onAreaOut);
  element.addEventListener('mousedown', onAreaDown);
  element.addEventListener('dblclick', onAreaDblClick);

  function onAreaDown(e) {
    e.preventDefault(); // prevent text selection cursor on drag
  }

  function onAreaEnter() {
    if (!_isOver) {
      _isOver = true;
      _self.dispatchEvent('enter');
    }
  }

  function onAreaOut(e) {
    _isOver = false;
    _self.dispatchEvent('leave');
  }

  function onMouseUp(e) {
    var evt = procMouseEvent(e),
        elapsed, dx, dy;
    if (_dragging) {
      _dragging = false;
      _self.dispatchEvent('dragend', evt);
    }
    if (_downEvt) {
      elapsed = evt.time - _downEvt.time;
      dx = evt.pageX - _downEvt.pageX;
      dy = evt.pageY - _downEvt.pageY;
      if (_isOver && elapsed < 500 && Math.sqrt(dx * dx + dy * dy) < 6) {
        _self.dispatchEvent('click', evt);
      }
      _downEvt = null;
    }
  }

  function onMouseDown(e) {
   if (e.button != 2 && e.which != 3) { // ignore right-click
      _downEvt = procMouseEvent(e);
    }
  }

  function onMouseMove(e) {
    var evt = procMouseEvent(e);
    if (!_dragging && _downEvt && _downEvt.hover) {
      _dragging = true;
      _self.dispatchEvent('dragstart', evt);
    }

    if (_dragging) {
      var obj = {
        dragX: evt.pageX - _downEvt.pageX,
        dragY: evt.pageY - _downEvt.pageY
      };
      _self.dispatchEvent('drag', utils.extend(obj, evt));
    } else {
      _self.dispatchEvent('hover', evt);
    }
  }

  function onAreaDblClick(e) {
    if (_isOver) _self.dispatchEvent('dblclick', procMouseEvent(e));
  }

  function procMouseEvent(e) {
    var pageX = e.pageX,
        pageY = e.pageY,
        prev = _prevEvt;
    _prevEvt = {
      shiftKey: e.shiftKey,
      time: +new Date,
      pageX: pageX,
      pageY: pageY,
      hover: _isOver,
      x: pageX - _areaPos.pageX,
      y: pageY - _areaPos.pageY,
      dx: prev ? pageX - prev.pageX : 0,
      dy: prev ? pageY - prev.pageY : 0
    };
    return _prevEvt;
  }

  this.isOver = function() {
    return _isOver;
  }

  this.isDown = function() {
    return !!_downEvt;
  }

  this.mouseData = function() {
    return utils.extend({}, _prevEvt);
  }
}

utils.inherit(MouseArea, EventDispatcher);






function ModeSwitcher() {
  var self = this;
  var mode = null;

  self.getMode = function() {
    return mode;
  };

  // return a function to trigger this mode
  self.addMode = function(name, enter, exit) {
    self.on('mode', function(e) {
      if (e.prev == name) {
        exit();
      }
      if (e.name == name) {
        enter();
      }
    });
  };

  self.addMode(null, function() {}, function() {}); // null mode

  self.clearMode = function() {
    self.enterMode(null);
  };

  self.enterMode = function(next) {
    var prev = mode;
    if (next != prev) {
      mode = next;
      self.dispatchEvent('mode', {name: next, prev: prev});
    }
  };
}

utils.inherit(ModeSwitcher, EventDispatcher);




var gui = api.gui = new ModeSwitcher();
api.enableLogging();

gui.browserIsSupported = function() {
  return typeof ArrayBuffer != 'undefined' &&
      typeof Blob != 'undefined' && typeof File != 'undefined';
};

gui.getUrlVars = function() {
  var q = window.location.search.substring(1);
  return q.split('&').reduce(function(memo, chunk) {
    var pair = chunk.split('=');
    var key = decodeURIComponent(pair[0]);
    memo[key] = decodeURIComponent(pair[1]);
    return memo;
  }, {});
};

// Assumes that URL path ends with a filename
gui.getUrlFilename = function(url) {
  var path = /\/\/([^#?]+)/.exec(url);
  var file = path ? path[1].split('/').pop() : '';
  return file;
};

gui.formatMessageArgs = function(args) {
  // remove cli annotation (if present)
  return internal.formatLogArgs(args).replace(/^\[[^\]]+\] ?/, '');
};

gui.handleDirectEvent = function(cb) {
  return function(e) {
    if (e.target == this) cb();
  };
};

gui.getInputElement = function() {
  var el = document.activeElement;
  return (el && (el.tagName == 'INPUT' || el.contentEditable == 'true')) ? el : null;
};

gui.selectElement = function(el) {
  var range = document.createRange(),
      sel = getSelection();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
};

gui.blurActiveElement = function() {
  var el = gui.getInputElement();
  if (el) el.blur();
};

// Filter out delayed click events, e.g. so users can highlight and copy text
gui.onClick = function(el, cb) {
  var time;
  el.on('mousedown', function() {
    time = +new Date();
  });
  el.on('mouseup', function(e) {
    if (+new Date() - time < 300) cb(e);
  });
};





// Replace error function in mapshaper lib
var error = internal.error = function() {
  stop.apply(null, utils.toArray(arguments));
};

// replace stop function
var stop = internal.stop = function() {
  // Show a popup error message, then throw an error
  var msg = gui.formatMessageArgs(arguments);
  gui.alert(msg);
  throw new Error(msg);
};


function AlertControl() {
  var el;
  gui.addMode('alert', function() {}, turnOff);

  function turnOff() {
    if (el) {
      el.remove();
      el = null;
    }
  }

  gui.alert = function(str) {
    var infoBox;
    if (el) return;
    el = El('div').appendTo('body').addClass('error-wrapper');
    infoBox = El('div').appendTo(el).addClass('error-box info-box selectable');
    El('p').addClass('error-message').appendTo(infoBox).html(str);
    El('div').addClass("btn dialog-btn").appendTo(infoBox).html('close').on('click', gui.clearMode);
    gui.enterMode('alert');
  };
}




// TODO: switch all ClickText to ClickText2

// @ref Reference to an element containing a text node
function ClickText2(ref) {
  var self = this;
  var selected = false;
  var el = El(ref).on('mousedown', init);

  function init() {
    el.removeEventListener('mousedown', init);
    el.attr('contentEditable', true)
    .attr('spellcheck', false)
    .attr('autocorrect', false)
    .on('focus', function(e) {
      el.addClass('editing');
      selected = false;
    }).on('blur', function(e) {
      el.removeClass('editing');
      self.dispatchEvent('change');
      getSelection().removeAllRanges();
    }).on('keydown', function(e) {
      if (e.keyCode == 13) { // enter
        e.stopPropagation();
        e.preventDefault();
        this.blur();
      }
    }).on('click', function(e) {
      if (!selected && getSelection().isCollapsed) {
        gui.selectElement(el.node());
      }
      selected = true;
      e.stopPropagation();
    });
  }

  this.value = function(str) {
    if (utils.isString(str)) {
      el.node().textContent = str;
    } else {
      return el.node().textContent;
    }
  };
}

utils.inherit(ClickText2, EventDispatcher);

// @ref reference to a text input element
function ClickText(ref) {
  var _el = El(ref);
  var _self = this;
  var _max = Infinity,
      _min = -Infinity,
      _formatter = function(v) {return String(v);},
      _validator = function(v) {return !isNaN(v);},
      _parser = function(s) {return parseFloat(s);},
      _value = 0;

  _el.on('blur', onblur);
  _el.on('keydown', onpress);

  function onpress(e) {
    if (e.keyCode == 27) { // esc
      _self.value(_value); // reset input field to current value
      _el.el.blur();
    } else if (e.keyCode == 13) { // enter
      _el.el.blur();
    }
  }

  // Validate input contents.
  // Update internal value and fire 'change' if valid
  //
  function onblur() {
    var val = _parser(_el.el.value);
    if (val === _value) {
      // return;
    }
    if (_validator(val)) {
      _self.value(val);
      _self.dispatchEvent('change', {value:_self.value()});
    } else {
      _self.value(_value);
      _self.dispatchEvent('error'); // TODO: improve
    }
  }

  this.bounds = function(min, max) {
    _min = min;
    _max = max;
    return this;
  };

  this.validator = function(f) {
    _validator = f;
    return this;
  };

  this.formatter = function(f) {
    _formatter = f;
    return this;
  };

  this.parser = function(f) {
    _parser = f;
    return this;
  };

  this.text = function() {return _el.el.value;};

  this.value = function(arg) {
    if (arg == void 0) {
      // var valStr = this.el.value;
      // return _parser ? _parser(valStr) : parseFloat(valStr);
      return _value;
    }
    var val = utils.clamp(arg, _min, _max);
    if (!_validator(val)) {
      error("ClickText#value() invalid value:", arg);
    } else {
      _value = val;
    }
    _el.el.value = _formatter(val);
    return this;
  };
}

utils.inherit(ClickText, EventDispatcher);


function Checkbox(ref) {
  var _el = El(ref);
}

utils.inherit(Checkbox, EventDispatcher);

function SimpleButton(ref) {
  var _el = El(ref),
      _self = this,
      _active = !_el.hasClass('disabled');

  _el.on('click', function(e) {
    if (_active) _self.dispatchEvent('click');
    return false;
  });

  this.active = function(a) {
    if (a === void 0) return _active;
    if (a !== _active) {
      _active = a;
      _el.toggleClass('disabled');
    }
    return this;
  };
}

utils.inherit(SimpleButton, EventDispatcher);




function ModeButton(el, name) {
  var btn = El(el),
      active = false;
  gui.on('mode', function(e) {
    active = e.name == name;
    if (active) {
      btn.addClass('active');
    } else {
      btn.removeClass('active');
    }
  });

  btn.on('click', function() {
    gui.enterMode(active ? null : name);
  });
}




function draggable(ref) {
  var xdown, ydown;
  var el = El(ref),
      dragging = false,
      obj = new EventDispatcher();
  Browser.undraggable(el.node());
  el.on('mousedown', function(e) {
    xdown = e.pageX;
    ydown = e.pageY;
    window.addEventListener('mousemove', onmove);
    window.addEventListener('mouseup', onrelease);
  });

  function onrelease(e) {
    window.removeEventListener('mousemove', onmove);
    window.removeEventListener('mouseup', onrelease);
    if (dragging) {
      dragging = false;
      obj.dispatchEvent('dragend');
    }
  }

  function onmove(e) {
    if (!dragging) {
      dragging = true;
      obj.dispatchEvent('dragstart');
    }
    obj.dispatchEvent('drag', {dx: e.pageX - xdown, dy: e.pageY - ydown});
  }
  return obj;
}

function Slider(ref, opts) {
  var _el = El(ref);
  var _self = this;
  var defaults = {
    space: 7
  };
  opts = utils.extend(defaults, opts);

  var _pct = 0;
  var _track,
      _handle,
      _handleLeft = opts.space;

  function size() {
    return _track ? _track.width() - opts.space * 2 : 0;
  }

  this.track = function(ref) {
    if (ref && !_track) {
      _track = El(ref);
      _handleLeft = _track.el.offsetLeft + opts.space;
      updateHandlePos();
    }
    return _track;
  };

  this.handle = function(ref) {
    var startX;
    if (ref && !_handle) {
      _handle = El(ref);
      draggable(_handle)
        .on('drag', function(e) {
          setHandlePos(startX + e.dx, true);
        })
        .on('dragstart', function(e) {
          startX = position();
          _self.dispatchEvent('start');
        })
        .on('dragend', function(e) {
          _self.dispatchEvent('end');
        });
      updateHandlePos();
    }
    return _handle;
  };

  function position() {
    return Math.round(_pct * size());
  }

  this.pct = function(pct) {
    if (pct >= 0 && pct <= 1) {
      _pct = pct;
      updateHandlePos();
    }
    return _pct;
  };

  function setHandlePos(x, fire) {
    x = utils.clamp(x, 0, size());
    var pct = x / size();
    if (pct != _pct) {
      _pct = pct;
      _handle.css('left', _handleLeft + x);
      _self.dispatchEvent('change', {pct: _pct});
    }
  }

  function updateHandlePos() {
    var x = _handleLeft + Math.round(position());
    if (_handle) _handle.css('left', x);
  }
}

utils.inherit(Slider, EventDispatcher);



var SimplifyControl = function(model) {
  var control = new EventDispatcher();
  var _value = 1;
  var el = El('#simplify-control-wrapper');
  var menu = El('#simplify-options');
  var slider, text;

  new SimpleButton('#simplify-options .submit-btn').on('click', onSubmit);
  new SimpleButton('#simplify-options .cancel-btn').on('click', function() {
    if (el.visible()) {
      // cancel just hides menu if slider is visible
      menu.hide();
    } else {
      gui.clearMode();
    }
  });
  new SimpleButton('#simplify-settings-btn').on('click', function() {
    if (menu.visible()) {
      menu.hide();
    } else {
      initMenu();
    }
  });

  new ModeButton('#simplify-btn', 'simplify');
  gui.addMode('simplify', turnOn, turnOff);
  model.on('select', function() {
    if (gui.getMode() == 'simplify') gui.clearMode();
  });

  // exit simplify mode when user clicks off the visible part of the menu
  menu.on('click', gui.handleDirectEvent(gui.clearMode));

  slider = new Slider("#simplify-control .slider");
  slider.handle("#simplify-control .handle");
  slider.track("#simplify-control .track");
  slider.on('change', function(e) {
    var pct = fromSliderPct(e.pct);
    text.value(pct);
    pct = utils.parsePercent(text.text()); // use rounded value (for consistency w/ cli)
    onchange(pct);
  });
  slider.on('start', function(e) {
    control.dispatchEvent('simplify-start');
  }).on('end', function(e) {
    control.dispatchEvent('simplify-end');
  });

  text = new ClickText("#simplify-control .clicktext");
  text.bounds(0, 1);
  text.formatter(function(val) {
    if (isNaN(val)) return '-';
    var pct = val * 100;
    var decimals = 0;
    if (pct <= 0) decimals = 1;
    else if (pct < 0.001) decimals = 4;
    else if (pct < 0.01) decimals = 3;
    else if (pct < 1) decimals = 2;
    else if (pct < 100) decimals = 1;
    return utils.formatNumber(pct, decimals) + "%";
  });

  text.parser(function(s) {
    return parseFloat(s) / 100;
  });

  text.value(0);
  text.on('change', function(e) {
    var pct = e.value;
    slider.pct(toSliderPct(pct));
    control.dispatchEvent('simplify-start');
    onchange(pct);
    control.dispatchEvent('simplify-end');
  });

  function turnOn() {
    var target = model.getActiveLayer();
    if (!internal.layerHasPaths(target.layer)) {
      gui.alert("This layer can not be simplified");
      return;
    }
    if (target.dataset.arcs.getVertexData().zz) {
      // TODO: try to avoid calculating pct (slow);
      showSlider(); // need to show slider before setting; TODO: fix
      control.value(target.dataset.arcs.getRetainedPct());
    } else {
      initMenu();
    }
  }

  function initMenu() {
    var dataset = model.getActiveLayer().dataset;
    var showPlanarOpt = !dataset.arcs.isPlanar();
    var opts = internal.getStandardSimplifyOpts(dataset, dataset.info && dataset.info.simplify);
    El('#planar-opt-wrapper').node().style.display = showPlanarOpt ? 'block' : 'none';
    El('#planar-opt').node().checked = !opts.spherical;
    El("#import-retain-opt").node().checked = opts.keep_shapes;
    El("#simplify-options input[value=" + opts.method + "]").node().checked = true;
    menu.show();
  }

  function turnOff() {
    menu.hide();
    control.reset();
  }

  function onSubmit() {
    var dataset = model.getActiveLayer().dataset;
    var showMsg = dataset.arcs && dataset.arcs.getPointCount() > 1e6;
    var delay = 0;
    if (showMsg) {
      delay = 35;
      gui.showProgressMessage('Calculating');
    }
    menu.hide();
    setTimeout(function() {
      var opts = getSimplifyOptions();
      mapshaper.simplify(dataset, opts);
      model.updated({
        // use presimplify flag if no vertices are removed
        // (to trigger map redraw without recalculating intersections)
        presimplify: opts.pct == 1,
        simplify: opts.pct < 1
      });
      showSlider();
      gui.clearProgressMessage();
    }, delay);
  }

  function showSlider() {
    el.show();
    El('body').addClass('simplify'); // for resizing, hiding layer label, etc.
  }

  function getSimplifyOptions() {
    var method = El('#simplify-options input[name=method]:checked').attr('value') || null;
    return {
      method: method,
      pct: _value,
      no_repair: true,
      keep_shapes: !!El("#import-retain-opt").node().checked,
      planar: !!El('#planar-opt').node().checked
    };
  }

  function toSliderPct(p) {
    p = Math.sqrt(p);
    var pct = 1 - p;
    return pct;
  }

  function fromSliderPct(p) {
    var pct = 1 - p;
    return pct * pct;
  }

  function onchange(val) {
    if (_value != val) {
      _value = val;
      control.dispatchEvent('change', {value:val});
    }
  }

  control.reset = function() {
    control.value(1);
    el.hide();
    menu.hide();
    El('body').removeClass('simplify');
  };

  control.value = function(val) {
    if (!isNaN(val)) {
      // TODO: validate
      _value = val;
      slider.pct(toSliderPct(val));
      text.value(val);
    }
    return _value;
  };

  control.value(_value);
  return control;
};


// Assume zip.js is loaded and zip is defined globally
zip.workerScripts = {
  // deflater: ['z-worker.js', 'deflate.js'], // use zip.js deflater
  // TODO: find out why it was necessary to rename pako_deflate.min.js
  deflater: ['z-worker.js', 'pako.deflate.js', 'codecs.js'],
  inflater: ['z-worker.js', 'pako.inflate.js', 'codecs.js']
};

// @file: Zip file
// @cb: function(err, <files>)
//
gui.readZipFile = function(file, cb) {
  var _files = [];
  zip.createReader(new zip.BlobReader(file), importZipContent, onError);

  function onError(err) {
    cb(err);
  }

  function onDone() {
    cb(null, _files);
  }

  function importZipContent(reader) {
    var _entries;
    reader.getEntries(readEntries);

    function readEntries(entries) {
      _entries = entries || [];
      readNext();
    }

    function readNext() {
      if (_entries.length > 0) {
        readEntry(_entries.pop());
      } else {
        reader.close();
        onDone();
      }
    }

    function readEntry(entry) {
      var filename = entry.filename,
          isValid = !entry.directory && gui.isReadableFileType(filename) &&
              !/^__MACOSX/.test(filename); // ignore "resource-force" files
      if (isValid) {
        entry.getData(new zip.BlobWriter(), function(file) {
          file.name = filename; // Give the Blob a name, like a File object
          _files.push(file);
          readNext();
        });
      } else {
        readNext();
      }
    }
  }
};




gui.showProgressMessage = function(msg) {
  if (!gui.progressMessage) {
    gui.progressMessage = El('div').id('progress-message')
      .appendTo('body');
  }
  El('<div>').text(msg).appendTo(gui.progressMessage.empty().show());
};

gui.clearProgressMessage = function() {
  if (gui.progressMessage) gui.progressMessage.hide();
};




gui.parseFreeformOptions = function(raw, cmd) {
  var str = raw.trim(),
      parsed;
  if (!str) {
    return {};
  }
  if (!/^-/.test(str)) {
    str = '-' + cmd + ' ' + str;
  }
  parsed =  internal.parseCommands(str);
  if (!parsed.length || parsed[0].name != cmd) {
    stop("Unable to parse command line options");
  }
  return parsed[0].options;
};




// tests if filename is a type that can be used
gui.isReadableFileType = function(filename) {
  var ext = utils.getFileExtension(filename).toLowerCase();
  return !!internal.guessInputFileType(filename) || internal.couldBeDsvFile(filename) ||
    internal.isZipFile(filename);
};

// @cb function(<FileList>)
function DropControl(cb) {
  var el = El('body');
  el.on('dragleave', ondrag);
  el.on('dragover', ondrag);
  el.on('drop', ondrop);
  function ondrag(e) {
    // blocking drag events enables drop event
    e.preventDefault();
  }
  function ondrop(e) {
    e.preventDefault();
    cb(e.dataTransfer.files);
  }
}

// @el DOM element for select button
// @cb function(<FileList>)
function FileChooser(el, cb) {
  var btn = El(el).on('click', function() {
    input.el.click();
  });
  var input = El('form')
    .addClass('file-control').appendTo('body')
    .newChild('input')
    .attr('type', 'file')
    .attr('multiple', 'multiple')
    .on('change', onchange);

  function onchange(e) {
    var files = e.target.files;
    // files may be undefined (e.g. if user presses 'cancel' after a file has been selected)
    if (files) {
      // disable the button while files are being processed
      btn.addClass('selected');
      input.attr('disabled', true);
      cb(files);
      btn.removeClass('selected');
      input.attr('disabled', false);
    }
  }
}

function ImportControl(model, opts) {
  var importCount = 0;
  var queuedFiles = [];
  var manifestFiles = opts.files || [];
  var importDataset;

  new SimpleButton('#import-buttons .submit-btn').on('click', submitFiles);
  new SimpleButton('#import-buttons .cancel-btn').on('click', gui.clearMode);
  gui.addMode('import', turnOn, turnOff);
  new DropControl(receiveFiles);
  new FileChooser('#file-selection-btn', receiveFiles);
  new FileChooser('#import-buttons .add-btn', receiveFiles);
  new FileChooser('#add-file-btn', receiveFiles);
  gui.enterMode('import');
  gui.on('mode', function(e) {
    // re-open import opts if leaving alert or console modes and nothing has been imported yet
    if (!e.name && importCount === 0) {
      gui.enterMode('import');
    }
  });

  function findMatchingShp(filename) {
    // use case-insensitive matching
    var base = utils.getPathBase(filename).toLowerCase();
    return model.getDatasets().filter(function(d) {
      var fname = (d.info.input_files[0] || '').toLowerCase();
      var ext = utils.getFileExtension(fname);
      var base2 = utils.getPathBase(fname);
      return base == base2 && ext == 'shp';
    });
  }

  function turnOn() {
    var el = El('#import-options');
    if (manifestFiles.length > 0) {
      downloadFiles(manifestFiles);
      manifestFiles = [];
    } else {
      if (importCount > 0) {
        el.removeClass('first-run');
      }
      el.show();
    }
  }

  function turnOff() {
    if (importDataset) {
      // display first layer of most recently imported dataset
      model.selectLayer(importDataset.layers[0], importDataset);
      importDataset = null;
    }
    gui.clearProgressMessage();
    clearFiles();
    close();
  }

  function close() {
    El('#fork-me').hide();
    El('#import-options').hide();
  }


  function clearFiles() {
    queuedFiles = [];
    El('#dropped-file-list .file-list').empty();
    El('#dropped-file-list').hide();
    El('#import-buttons').hide();
  }

  function addFiles(files) {
    var index = {};
    queuedFiles = queuedFiles.concat(files).reduce(function(memo, f) {
      // filter out unreadable types and dupes
      if (gui.isReadableFileType(f.name) && f.name in index === false) {
        index[f.name] = true;
        memo.push(f);
      }
      return memo;
    }, []);
    // sort alphabetically by filename
    queuedFiles.sort(function(a, b) {
      // Sorting on LC filename is a kludge, so Shapefiles with mixed-case
      // extensions are sorted with .shp component before .dbf
      // (When .dbf files are queued first, they are imported as a separate layer.
      // This is so data layers are not later converted into shape layers,
      // e.g. to allow joining a shape layer to its own dbf data table).
      return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
    });
  }

  function showQueuedFiles() {
    var list = El('#dropped-file-list .file-list').empty();
    El('#dropped-file-list').show();
    queuedFiles.forEach(function(f) {
      El('<p>').text(f.name).appendTo(El("#dropped-file-list .file-list"));
    });
  }

  function receiveFiles(files) {
    var prevSize = queuedFiles.length;
    addFiles(utils.toArray(files));
    if (queuedFiles.length === 0) return;
    gui.enterMode('import');
    if (importCount === 0 && prevSize === 0 && containsImmediateFile(queuedFiles)) {
      // if the first batch of files will be imported, process right away
      submitFiles();
    } else {
      showQueuedFiles();
      El('#import-buttons').show();
    }
  }

  // Check if an array of File objects contains a file that should be imported right away
  function containsImmediateFile(files) {
    return utils.some(files, function(f) {
        var type = internal.guessInputFileType(f.name);
        return type == 'shp' || type == 'json';
    });
  }

  function submitFiles() {
    close();
    readNext();
  }

  function readNext() {
    if (queuedFiles.length > 0) {
      readFile(queuedFiles.pop()); // read in rev. alphabetic order, so .shp comes before .dbf
    } else {
      gui.clearMode();
    }
  }

  function getImportOpts() {
    var freeform = El('#import-options .advanced-options').node().value,
        opts = gui.parseFreeformOptions(freeform, 'i');
    opts.no_repair = !El("#repair-intersections-opt").node().checked;
    opts.auto_snap = !!El("#snap-points-opt").node().checked;
    return opts;
  }

  function loadFile(file, cb) {
    var reader = new FileReader(),
        isBinary = internal.isBinaryFile(file.name);
    // no callback on error -- fix?
    reader.onload = function(e) {
      cb(null, reader.result);
    };
    if (isBinary) {
      reader.readAsArrayBuffer(file);
    } else {
      // TODO: improve to handle encodings, etc.
      reader.readAsText(file, 'UTF-8');
    }
  }

  // @file a File object
  function readFile(file) {
    if (internal.isZipFile(file.name)) {
      readZipFile(file);
    } else {
      loadFile(file, function(err, content) {
        if (err) {
          readNext();
        } else {
          readFileContent(file.name, content);
        }
      });
    }
  }

  function readFileContent(name, content) {
    var type = internal.guessInputType(name, content),
        importOpts = getImportOpts(),
        matches = findMatchingShp(name),
        dataset, lyr;

    // TODO: refactor
    if (type == 'dbf' && matches.length > 0) {
      // find an imported .shp layer that is missing attribute data
      // (if multiple matches, try to use the most recently imported one)
      dataset = matches.reduce(function(memo, d) {
        if (!d.layers[0].data) {
          memo = d;
        }
        return memo;
      }, null);
      if (dataset) {
        lyr = dataset.layers[0];
        lyr.data = new internal.ShapefileTable(content, importOpts.encoding);
        if (lyr.shapes && lyr.data.size() != lyr.shapes.length) {
          stop("Different number of records in .shp and .dbf files");
        }
        if (!lyr.geometry_type) {
          // kludge: trigger display of table cells if .shp has null geometry
          model.updated({}, lyr, dataset);
        }
        readNext();
        return;
      }
    }

    if (type == 'prj') {
      // assumes that .shp has been imported first
      matches.forEach(function(d) {
        if (!d.info.input_prj) {
          d.info.input_prj = content;
        }
      });
      readNext();
      return;
    }

    importFileContent(type, name, content, importOpts);
  }

  function importFileContent(type, path, content, importOpts) {
    var size = content.byteLength || content.length, // ArrayBuffer or string
        showMsg = size > 4e7, // don't show message if dataset is small
        delay = 0;
    importOpts.files = [path]; // TODO: try to remove this
    if (showMsg) {
      gui.showProgressMessage('Importing');
      delay = 35;
    }
    setTimeout(function() {
      var dataset;
      try {
        dataset = internal.importFileContent(content, path, importOpts);
        dataset.info.no_repair = importOpts.no_repair;
        model.addDataset(dataset);
        importDataset = dataset;
        importCount++;
        readNext();
     } catch(e) {
        handleImportError(e, path);
      }
    }, delay);
  }

  function handleImportError(e, path) {
    var msg = utils.isString(e) ? e : e.message;
    if (path) {
      msg = "Error importing " + path + ":\n" + msg;
    }
    clearFiles();
    gui.alert(msg);
    console.error(e);
  }

  function readZipFile(file) {
    gui.showProgressMessage('Importing');
    setTimeout(function() {
      gui.readZipFile(file, function(err, files) {
        if (err) {
          handleImportError(err, file.name);
        } else {
          // don't try to import .txt files from zip files
          // (these would be parsed as dsv and throw errows)
          files = files.filter(function(f) {
            return !/\.txt$/i.test(f.name);
          });
          addFiles(files);
          readNext();
        }
      });
    }, 35);
  }

  function prepFilesForDownload(names) {
    var items = names.map(function(name) {
      var isUrl = /:\/\//.test(name);
      var item = {name: name};
      if (isUrl) {
        item.url = name;
        item.basename = gui.getUrlFilename(name);
      } else {
        item.basename = name;
        // Assume non-urls are local files loaded via mapshaper-gui
        item.url = '/data/' + name;
      }
      return gui.isReadableFileType(item.basename) ? item : null;
    });
    return items.filter(Boolean);
  }

  function downloadFiles(paths, opts) {
    var items = prepFilesForDownload(paths);
    utils.reduceAsync(items, [], downloadNextFile, function(err, files) {
      if (err) {
        gui.alert(err);
      } else if (!files.length) {
        gui.clearMode();
      } else {
        addFiles(files);
        submitFiles();
      }
    });
  }

  function downloadNextFile(memo, item, next) {
    var req = new XMLHttpRequest();
    var blob;
    req.responseType = 'blob';
    req.addEventListener('load', function(e) {
      if (req.status == 200) {
        blob = req.response;
      }
    });
    req.addEventListener('loadend', function() {
      var err;
      if (req.status == 404) {
        err = "Not&nbsp;found:&nbsp;" + item.name;
      } else if (!blob) {
        // Errors like DNS lookup failure, no CORS headers, no network connection
        // all are status 0 - it seems impossible to show a more specific message
        // actual reason is displayed on the console
        err = "Error&nbsp;loading&nbsp;" + item.name + ". Possible causes include: wrong URL, no network connection, server not configured for cross-domain sharing (CORS).";
      } else {
        blob.name = item.basename;
        memo.push(blob);
      }
      next(err, memo);
    });
    req.open('GET', item.url);
    req.send();
  }
}




gui.exportIsSupported = function() {
  return typeof URL != 'undefined' && URL.createObjectURL &&
    typeof document.createElement("a").download != "undefined" ||
    !!window.navigator.msSaveBlob;
};

// replaces function from mapshaper.js
internal.writeFiles = function(files, opts, done) {
  var filename;
  if (!utils.isArray(files) || files.length === 0) {
    done("Nothing to export");
  } else if (files.length == 1) {
    saveBlob(files[0].filename, new Blob([files[0].content]), done);
  } else {
    filename = utils.getCommonFileBase(utils.pluck(files, 'filename')) || "output";
    saveZipFile(filename + ".zip", files, done);
  }
};

function saveZipFile(zipfileName, files, done) {
  var toAdd = files;
  var zipWriter;
  try {
    zip.createWriter(new zip.BlobWriter("application/zip"), function(writer) {
      zipWriter = writer;
      nextFile();
    }, zipError);
  } catch(e) {
    done("This browser doesn't support Zip file creation.");
  }

  function zipError(msg) {
    var str = "Error creating Zip file";
    if (msg) {
      str += ": " + (msg.message || msg);
    }
    done(str);
  }

  function nextFile() {
    if (toAdd.length === 0) {
      zipWriter.close(function(blob) {
        saveBlob(zipfileName, blob, done);
      });
    } else {
      var obj = toAdd.pop(),
          blob = new Blob([obj.content]);
      zipWriter.add(obj.filename, new zip.BlobReader(blob), nextFile);
    }
  }
}

function saveBlob(filename, blob, done) {
  var anchor, blobUrl;
  if (window.navigator.msSaveBlob) {
    window.navigator.msSaveBlob(blob, filename);
    return done();
  }
  try {
    blobUrl = URL.createObjectURL(blob);
  } catch(e) {
    done("Mapshaper can't export files from this browser. Try switching to Chrome or Firefox.");
    return;
  }
  anchor = El('a').attr('href', '#').appendTo('body').node();
  anchor.href = blobUrl;
  anchor.download = filename;
  var clickEvent = document.createEvent("MouseEvent");
  clickEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false,
      false, false, false, 0, null);
  anchor.dispatchEvent(clickEvent);
  setTimeout(function() {
    // Revoke blob url to release memory; timeout needed in firefox
    URL.revokeObjectURL(blobUrl);
    anchor.parentNode.removeChild(anchor);
    done();
  }, 400);
}




// Export buttons and their behavior
var ExportControl = function(model) {
  var unsupportedMsg = "Exporting is not supported in this browser";
  var menu = El('#export-options').on('click', gui.handleDirectEvent(gui.clearMode));
  var checkboxes = []; // array of layer checkboxes
  new SimpleButton('#export-options .cancel-btn').on('click', gui.clearMode);

  if (!gui.exportIsSupported()) {
    El('#export-btn').on('click', function() {
      gui.alert(unsupportedMsg);
    });

    internal.writeFiles = function() {
      error(unsupportedMsg);
    };
  } else {
    new SimpleButton('#save-btn').on('click', onExportClick);
    gui.addMode('export', turnOn, turnOff);
    new ModeButton('#export-btn', 'export');
  }

  function onExportClick() {
    gui.showProgressMessage('Exporting');
    gui.clearMode();
    setTimeout(function() {
      exportMenuSelection(function(err) {
        if (err) {
          if (utils.isString(err)) {
            gui.alert(err);
          } else {
            // stack seems to change if Error is logged directly
            console.error(err.stack);
            gui.alert("Export failed for an unknown reason");
          }
        }
        gui.clearProgressMessage();
      });
    }, 20);
  }

  // @done function(string|Error|null)
  function exportMenuSelection(done) {
    var opts, files;
    try {
      opts = gui.parseFreeformOptions(El('#export-options .advanced-options').node().value, 'o');
      if (!opts.format) opts.format = getSelectedFormat();
      // ignoring command line "target" option
      files = internal.exportTargetLayers(getTargetLayers(), opts);
    } catch(e) {
      return done(e);
    }
    internal.writeFiles(files, opts, done);
  }

  function initLayerMenu() {
    // init layer menu with current editing layer selected
    var list = El('#export-layer-list').empty();
    var template = '<label><input type="checkbox" checked> %s</label>';
    var checkboxes = [];
    model.forEachLayer(function(lyr, dataset) {
      var html = utils.format(template, lyr.name || '[unnamed layer]');
      var box = El('div').html(html).appendTo(list).findChild('input').node();
      checkboxes.push(box);
    });
    El('#export-layers').css('display', checkboxes.length < 2 ? 'none' : 'block');
    return checkboxes;
  }

  function getInputFormats() {
    return model.getDatasets().reduce(function(memo, d) {
      var fmts = d.info && d.info.input_formats || [];
      return memo.concat(fmts);
    }, []);
  }

  function getDefaultExportFormat() {
    var dataset = model.getActiveLayer().dataset;
    return dataset.info && dataset.info.input_formats &&
        dataset.info.input_formats[0] || 'geojson';
  }

  function initFormatMenu() {
    var defaults = ['shapefile', 'geojson', 'topojson', 'dsv', 'svg'];
    var formats = utils.uniq(defaults.concat(getInputFormats()));
    var items = formats.map(function(fmt) {
      return utils.format('<div><label><input type="radio" name="format" value="%s"' +
        ' class="radio">%s</label></div>', fmt, internal.getFormatName(fmt));
    });
    El('#export-formats').html(items.join('\n'));
    El('#export-formats input[value="' + getDefaultExportFormat() + '"]').node().checked = true;
  }

  function turnOn() {
    checkboxes = initLayerMenu();
    initFormatMenu();
    menu.show();
  }

  function turnOff() {
    menu.hide();
  }

  function getSelectedFormat() {
    return El('#export-formats input:checked').node().value;
  }

  function getTargetLayers() {
    var ids = checkboxes.reduce(function(memo, box, i) {
      if (box.checked) memo.push(String(i + 1)); // numerical layer id
      return memo;
    }, []).join(',');
    return ids ? model.findCommandTargets(ids) : [];
  }
};




function RepairControl(model, map) {
  var el = El("#intersection-display"),
      readout = el.findChild("#intersection-count"),
      btn = el.findChild("#repair-btn"),
      _self = this,
      _dataset, _currXX;

  model.on('update', function(e) {
    if (e.flags.simplify || e.flags.proj || e.flags.arc_count ||e.flags.affine ||
      e.flags.points) {
      // these changes require nulling out any cached intersection data and recalculating
      if (_dataset) {
        _dataset.info.intersections = null;
        _dataset = null;
        _self.hide();
      }
      delayedUpdate();
    } else if (e.flags.select) {
      _self.hide();
      reset();
      delayedUpdate();
    }
  });

  btn.on('click', function() {
    var fixed = internal.repairIntersections(_dataset.arcs, _currXX);
    showIntersections(fixed);
    btn.addClass('disabled');
    model.updated({repair: true});
  });

  this.hide = function() {
    el.hide();
    map.setHighlightLayer(null);
  };

  // Detect and display intersections for current level of arc simplification
  this.update = function() {
    var XX, showBtn, pct;
    if (!_dataset) return;
    if (_dataset.arcs.getRetainedInterval() > 0) {
      // TODO: cache these intersections
      XX = internal.findSegmentIntersections(_dataset.arcs);
      showBtn = XX.length > 0;
    } else { // no simplification
      XX = _dataset.info.intersections;
      if (!XX) {
        // cache intersections at 0 simplification, to avoid recalculating
        // every time the simplification slider is set to 100% or the layer is selected at 100%
        XX = _dataset.info.intersections = internal.findSegmentIntersections(_dataset.arcs);
      }
      showBtn = false;
    }
    el.show();
    showIntersections(XX);
    btn.classed('disabled', !showBtn);
  };

  function delayedUpdate() {
    setTimeout(function() {
      var e = model.getActiveLayer();
      if (e.dataset && e.dataset != _dataset && !e.dataset.info.no_repair &&
          internal.layerHasPaths(e.layer)) {
        _dataset = e.dataset;
        _self.update();
      }
    }, 10);
  }

  function reset() {
    _dataset = null;
    _currXX = null;
    _self.hide();
  }

  function showIntersections(XX) {
    var n = XX.length, pointLyr;
    _currXX = XX;
    if (n > 0) {
      pointLyr = {geometry_type: 'point', shapes: [internal.getIntersectionPoints(XX)]};
      map.setHighlightLayer(pointLyr, {layers:[pointLyr]});
      readout.text(utils.format("%s line intersection%s", n, utils.pluralSuffix(n)));
    } else {
      map.setHighlightLayer(null);
      readout.text('');
    }
  }
}

utils.inherit(RepairControl, EventDispatcher);




function LayerControl(model, map) {
  var el = El("#layer-control").on('click', gui.handleDirectEvent(gui.clearMode));
  var buttonLabel = El('#layer-control-btn .layer-name');
  var isOpen = false;
  var pinnedLyr = null;

  new ModeButton('#layer-control-btn .header-btn', 'layer_menu');
  gui.addMode('layer_menu', turnOn, turnOff);
  model.on('update', function(e) {
    updateBtn();
    if (isOpen) render();
  });

  function turnOn() {
    isOpen = true;
    // set max layer menu height
    render();
    El('#layer-control div.info-box-scrolled').css('max-height', El('body').height() - 80);
    el.show();
  }

  function turnOff() {
    isOpen = false;
    el.hide();
  }

  function updateBtn() {
    var name = model.getActiveLayer().layer.name || "[unnamed layer]";
    buttonLabel.html(name + " &nbsp;&#9660;");
  }

  function render() {
    var list = El('#layer-control .layer-list');
    var pinnable = 0;
    if (isOpen) {
      list.hide().empty();
      model.forEachLayer(function(lyr, dataset) {
        if (isPinnable(lyr)) pinnable++;
      });
      if (pinnable === 0 && pinnedLyr) {
        clearPin(); // a layer has been deleted...
      }
      model.forEachLayer(function(lyr, dataset) {
        list.appendChild(renderLayer(lyr, dataset, pinnable > 1 && isPinnable(lyr)));
      });
      list.show();
    }
  }

  function describeLyr(lyr) {
    var n = internal.getFeatureCount(lyr),
        str, type;
    if (lyr.data && !lyr.shapes) {
      type = 'data record';
    } else if (lyr.geometry_type) {
      type = lyr.geometry_type + ' feature';
    }
    if (type) {
      str = utils.format('%,d %s%s', n, type, utils.pluralSuffix(n));
    } else {
      str = "[empty]";
    }
    return str;
  }

  function describeSrc(lyr, dataset) {
    var inputs = dataset.info.input_files;
    var file = inputs && inputs[0] || '';
    if (utils.endsWith(file, '.shp') && !lyr.data && lyr == dataset.layers[0]) {
      file += " (missing .dbf)";
    }
    return file;
  }

  function getDisplayName(name) {
    return name || '[unnamed]';
  }

  function setPin(lyr, dataset) {
    if (pinnedLyr != lyr) {
      clearPin();
      map.setReferenceLayer(lyr, dataset);
      pinnedLyr = lyr;
      el.addClass('visible-pin');
    }
  }

  function clearPin() {
    if (pinnedLyr) {
      Elements('.layer-item.pinned').forEach(function(el) {
        el.removeClass('pinned');
      });
      el.removeClass('visible-pin');
      pinnedLyr = null;
      map.setReferenceLayer(null);
    }
  }

  function isPinnable(lyr) {
    return !!lyr.geometry_type;
  }

  function renderLayer(lyr, dataset, pinnable) {
    var editLyr = model.getActiveLayer().layer;
    var entry = El('div').addClass('layer-item').classed('active', lyr == editLyr);
    var html = rowHTML('name', '<span class="layer-name colored-text dot-underline">' + getDisplayName(lyr.name) + '</span>', 'row1');
    html += rowHTML('source file', describeSrc(lyr, dataset) || 'n/a');
    html += rowHTML('contents', describeLyr(lyr));
    html += '<img class="close-btn" src="images/close.png">';
    if (pinnable) {
      html += '<img class="pin-btn unpinned" src="images/eye.png">';
      html += '<img class="pin-btn pinned" src="images/eye2.png">';
    }
    entry.html(html);

    // init delete button
    entry.findChild('img.close-btn').on('mouseup', function(e) {
        e.stopPropagation();
        deleteLayer(lyr, dataset);
      });

    if (pinnable) {
      if (pinnedLyr == lyr) {
        entry.addClass('pinned');
      }

      // init pin button
      entry.findChild('img.pinned').on('mouseup', function(e) {
        e.stopPropagation();
        if (lyr == pinnedLyr) {
          clearPin();
        } else {
          setPin(lyr, dataset);
          entry.addClass('pinned');
        }
      });
    }

    // init name editor
    new ClickText2(entry.findChild('.layer-name'))
      .on('change', function(e) {
        var str = cleanLayerName(this.value());
        this.value(getDisplayName(str));
        lyr.name = str;
        updateBtn();
      });
    // init click-to-select
    gui.onClick(entry, function() {
      if (!gui.getInputElement()) { // don't select if user is typing
        gui.clearMode();
        if (lyr != editLyr) {
          model.updated({select: true}, lyr, dataset);
        }
      }
    });
    return entry;
  }

  function deleteLayer(lyr, dataset) {
    var active, flags;
    if (lyr == pinnedLyr) {
      clearPin();
    }
    model.deleteLayer(lyr, dataset);
    if (model.isEmpty()) {
      // refresh browser if deleted layer was the last layer
      window.location.href = window.location.href.toString();
    } else {
      // trigger event to update layer list and, if needed, the map view
      flags = {};
      active = model.getActiveLayer();
      if (active.layer != lyr) {
        flags.select = true;
      }
      if (internal.cleanupArcs(active.dataset)) {
        flags.arc_count = true;
      }
      model.updated(flags, active.layer, active.dataset);
    }
  }

  function cleanLayerName(raw) {
    return raw.replace(/[\n\t/\\]/g, '')
      .replace(/^[\.\s]+/, '').replace(/[\.\s]+$/, '');
  }

  function rowHTML(c1, c2, cname) {
    return utils.format('<div class="row%s"><div class="col1">%s</div>' +
      '<div class="col2">%s</div></div>', cname ? ' ' + cname : '', c1, c2);
  }
}




// These functions could be called when validating i/o options; TODO: avoid this
cli.isFile =
cli.isDirectory = function(name) {return false;};

cli.validateOutputDir = function() {};

// Replaces functions for reading from files with functions that try to match
// already-loaded datasets.
//
function ImportFileProxy(model) {
  // Try to match an imported dataset or layer.
  // TODO: think about handling import options
  function find(src) {
    var datasets = model.getDatasets();
    var retn = datasets.reduce(function(memo, d) {
      var lyr;
      if (memo) return memo; // already found a match
      // try to match import filename of this dataset
      if (d.info.input_files[0] == src) return d;
      // try to match name of a layer in this dataset
      lyr = utils.find(d.layers, function(lyr) {return lyr.name == src;});
      return lyr ? internal.isolateLayer(lyr, d) : null;
    }, null);
    if (!retn) stop("Missing data layer [" + src + "]");
    return retn;
  }

  api.importFile = function(src, opts) {
    var dataset = find(src);
    // Aeturn a copy with layers duplicated, so changes won't affect original layers
    // This makes an (unsafe) assumption that the dataset arcs won't be changed...
    // need to rethink this.
    return utils.defaults({
      layers: dataset.layers.map(internal.copyLayer)
    }, dataset);
  };

  /*
  api.importDataTable = function(src, opts) {
    var dataset = find(src);
    return dataset.layers[0].data;
  };
  */
}




gui.getPixelRatio = function() {
  var deviceRatio = window.devicePixelRatio || window.webkitDevicePixelRatio || 1;
  return deviceRatio > 1 ? 2 : 1;
};

function DisplayCanvas() {
  var _self = El('canvas'),
      _canvas = _self.node(),
      _ctx = _canvas.getContext('2d'),
      _ext;

  _self.prep = function(extent) {
    var w = extent.width(),
        h = extent.height(),
        pixRatio = gui.getPixelRatio();
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    _canvas.width = w * pixRatio;
    _canvas.height = h * pixRatio;
    _self.classed('retina', pixRatio == 2);
    _self.show();
    _ext = extent;
  };

  /*
  // Original function, not optimized
  _self.drawPathShapes = function(shapes, arcs, style) {
    var startPath = getPathStart(_ext),
        drawPath = getShapePencil(arcs, _ext),
        styler = style.styler || null;
    for (var i=0, n=shapes.length; i<n; i++) {
      if (styler) styler(style, i);
      startPath(_ctx, style);
      drawPath(shapes[i], _ctx);
      endPath(_ctx, style);
    }
  };
  */

  // Optimized to draw paths in same-style batches (faster Canvas drawing)
  _self.drawPathShapes = function(shapes, arcs, style) {
    var styleIndex = {};
    var batchSize = 1500;
    var startPath = getPathStart(_ext, getLineScale(_ext));
    var drawPath = getShapePencil(arcs, _ext);
    var key, item;
    var styler = style.styler || null;
    for (var i=0; i<shapes.length; i++) {
      if (styler) styler(style, i);
      key = getStyleKey(style);
      if (key in styleIndex === false) {
        styleIndex[key] = {
          style: utils.defaults({}, style),
          shapes: []
        };
      }
      item = styleIndex[key];
      item.shapes.push(shapes[i]);
      if (item.shapes.length >= batchSize) {
        drawPaths(item.shapes, startPath, drawPath, item.style);
        item.shapes = [];
      }
    }
    Object.keys(styleIndex).forEach(function(key) {
      var item = styleIndex[key];
      drawPaths(item.shapes, startPath, drawPath, item.style);
    });
  };

  function drawPaths(shapes, startPath, drawPath, style) {
    startPath(_ctx, style);
    for (var i=0, n=shapes.length; i<n; i++) {
      drawPath(shapes[i], _ctx);
    }
    endPath(_ctx, style);
  }

  _self.drawSquareDots = function(shapes, style) {
    var t = getScaledTransform(_ext),
        pixRatio = gui.getPixelRatio(),
        scaleRatio = getDotScale(_ext),
        size = Math.ceil((style.dotSize || 3) * pixRatio * scaleRatio),
        styler = style.styler || null,
        shp, p;

    _ctx.fillStyle = style.dotColor || "black";
    // TODO: don't try to draw offscreen points
    for (var i=0, n=shapes.length; i<n; i++) {
      if (styler !== null) {
        styler(style, i);
        size = style.dotSize * pixRatio;
        _ctx.fillStyle = style.dotColor;
      }
      shp = shapes[i];
      for (var j=0, m=shp ? shp.length : 0; j<m; j++) {
        if (!shp) continue;
        p = shp[j];
        drawSquare(p[0] * t.mx + t.bx, p[1] * t.my + t.by, size, _ctx);
      }
    }
  };

  // TODO: consider using drawPathShapes(), which draws paths in batches
  // for faster Canvas rendering. Downside: changes stacking order, which
  // is bad if circles are graduated.
  _self.drawPoints = function(shapes, style) {
    var t = getScaledTransform(_ext),
        pixRatio = gui.getPixelRatio(),
        startPath = getPathStart(_ext),
        styler = style.styler || null,
        shp, p;

    for (var i=0, n=shapes.length; i<n; i++) {
      shp = shapes[i];
      if (styler) styler(style, i);
      startPath(_ctx, style);
      if (!shp || style.radius > 0 === false) continue;
      for (var j=0, m=shp ? shp.length : 0; j<m; j++) {
        p = shp[j];
        drawCircle(p[0] * t.mx + t.bx, p[1] * t.my + t.by, style.radius * pixRatio, _ctx);
      }
      endPath(_ctx, style);
    }
  };

  _self.drawArcs = function(arcs, style, filter) {
    var startPath = getPathStart(_ext, getLineScale(_ext)),
        t = getScaledTransform(_ext),
        ctx = _ctx,
        n = 25, // render paths in batches of this size (an optimization)
        count = 0;
    startPath(ctx, style);
    for (i=0, n=arcs.size(); i<n; i++) {
      if (filter && !filter(i)) continue;
      if (++count % n === 0) {
        endPath(ctx, style);
        startPath(ctx, style);
      }
      drawPath(arcs.getArcIter(i), t, ctx, 0.6);
    }
    endPath(ctx, style);
  };

  function getStyleKey(style) {
    return (style.strokeWidth > 0 ? style.strokeColor + '~' + style.strokeWidth +
      '~' : '') + (style.fillColor || '') + (style.opacity < 1 ? '~' + style.opacity : '');
  }

  return _self;
}

function getScaledTransform(ext) {
  return ext.getTransform(gui.getPixelRatio());
}

function drawCircle(x, y, radius, ctx) {
  if (radius > 0) {
    ctx.moveTo(x + radius, y);
    ctx.arc(x, y, radius, 0, Math.PI * 2, true);
  }
}

function drawSquare(x, y, size, ctx) {
  if (size > 0) {
    var offs = size / 2;
    x = Math.round(x - offs);
    y = Math.round(y - offs);
    ctx.fillRect(x, y, size, size);
  }
}

function drawPath(vec, t, ctx, minLen) {
  var x, y, xp, yp;
  if (!vec.hasNext()) return;
  minLen = minLen >= 0 ? minLen : 0.4;
  x = xp = vec.x * t.mx + t.bx;
  y = yp = vec.y * t.my + t.by;
  ctx.moveTo(x, y);
  while (vec.hasNext()) {
    x = vec.x * t.mx + t.bx;
    y = vec.y * t.my + t.by;
    if (Math.abs(x - xp) > minLen || Math.abs(y - yp) > minLen) {
      ctx.lineTo(x, y);
      xp = x;
      yp = y;
    }
  }
}

function getShapePencil(arcs, ext) {
  var t = getScaledTransform(ext);
  var iter = new internal.ShapeIter(arcs);
  return function(shp, ctx) {
    for (var i=0, n=shp ? shp.length : 0; i<n; i++) {
      iter.init(shp[i]);
      // 0.2 trades visible seams for performance
      drawPath(iter, t, ctx, 0.2);
    }
  };
}

// Vary line width according to zoom ratio.
// For performance and clarity don't start widening until zoomed quite far in.
function getLineScale(ext) {
  var mapScale = ext.scale(),
      s = 1;
  if (mapScale < 0.5) {
    s *= Math.pow(mapScale + 0.5, 0.25);
  } else if (mapScale > 60) {
    s *= Math.pow(mapScale - 59, 0.18);
    s = Math.min(s, 5); // limit max scale
  }
  return s;
}

function getDotScale(ext) {
  return Math.pow(getLineScale(ext), 0.6);
}

function getPathStart(ext, lineScale) {
  var pixRatio = gui.getPixelRatio();
  if (!lineScale) lineScale = 1;
  return function(ctx, style) {
    var strokeWidth;
    ctx.beginPath();
    if (style.opacity >= 0) {
      ctx.globalAlpha = style.opacity;
    }
    if (style.strokeWidth > 0) {
      strokeWidth = style.strokeWidth;
      if (pixRatio > 1) {
        // bump up thin lines on retina, but not to more than 1px (too slow)
        strokeWidth = strokeWidth < 1 ? 1 : strokeWidth * pixRatio;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = strokeWidth * lineScale;
      ctx.strokeStyle = style.strokeColor;
    }
    if (style.fillColor) {
      ctx.fillStyle = style.fillColor;
    }
  };
}

function endPath(ctx, style) {
  if (style.fillColor) ctx.fill();
  if (style.strokeWidth > 0) ctx.stroke();
  if (style.opacity >= 0) ctx.globalAlpha = 1;
  ctx.closePath();
}




// A wrapper for ArcCollection that filters paths to speed up rendering.
//
function FilteredArcCollection(unfilteredArcs) {
  var sortedThresholds,
      filteredArcs,
      filteredSegLen;

  init();

  function init() {
    var size = unfilteredArcs.getPointCount(),
        cutoff = 5e5,
        nth;
    sortedThresholds = filteredArcs = null;
    if (!!unfilteredArcs.getVertexData().zz) {
      // If we have simplification data...
      // Sort simplification thresholds for all non-endpoint vertices
      // for quick conversion of simplification percentage to threshold value.
      // For large datasets, use every nth point, for faster sorting.
      nth = Math.ceil(size / cutoff);
      sortedThresholds = unfilteredArcs.getRemovableThresholds(nth);
      utils.quicksort(sortedThresholds, false);
      // For large datasets, create a filtered copy of the data for faster rendering
      if (size > cutoff) {
        filteredArcs = initFilteredArcs(unfilteredArcs, sortedThresholds);
        filteredSegLen = internal.getAvgSegment(filteredArcs);
      }
    } else {
      if (size > cutoff) {
        // generate filtered arcs when no simplification data is present
        filteredSegLen = internal.getAvgSegment(unfilteredArcs) * 4;
        filteredArcs = internal.simplifyArcsFast(unfilteredArcs, filteredSegLen);
      }
    }
  }

  // Use simplification data to create a low-detail copy of arcs, for faster
  // rendering when zoomed-out.
  function initFilteredArcs(arcs, sortedThresholds) {
    var filterPct = 0.08;
    var currInterval = arcs.getRetainedInterval();
    var filterZ = sortedThresholds[Math.floor(filterPct * sortedThresholds.length)];
    var filteredArcs = arcs.setRetainedInterval(filterZ).getFilteredCopy();
    arcs.setRetainedInterval(currInterval); // reset current simplification
    return filteredArcs;
  }

  this.getArcCollection = function(ext) {
    refreshFilteredArcs();
    // Use a filtered version of arcs at small scales
    var unitsPerPixel = 1/ext.getTransform().mx,
        useFiltering = filteredArcs && unitsPerPixel > filteredSegLen * 1.5;
    return useFiltering ? filteredArcs : unfilteredArcs;
  };

  function refreshFilteredArcs() {
    if (filteredArcs) {
      if (filteredArcs.size() != unfilteredArcs.size()) {
        init();
      }
      filteredArcs.setRetainedInterval(unfilteredArcs.getRetainedInterval());
    }
  }

  this.size = function() {return unfilteredArcs.size();};

  this.setRetainedPct = function(pct) {
    if (sortedThresholds) {
      var z = sortedThresholds[Math.floor(pct * sortedThresholds.length)];
      z = internal.clampIntervalByPct(z, pct);
      // this.setRetainedInterval(z);
      unfilteredArcs.setRetainedInterval(z);
    } else {
      unfilteredArcs.setRetainedPct(pct);
    }
  };
}




gui.getDisplayLayerForTable = function(table) {
  var n = table.size(),
      cellWidth = 12,
      cellHeight = 5,
      gutter = 6,
      arcs = [],
      shapes = [],
      lyr = {shapes: shapes},
      data = {layer: lyr},
      aspectRatio = 1.1,
      usePoints = false,
      x, y, col, row, blockSize;

  if (n > 10000) {
    usePoints = true;
    gutter = 0;
    cellWidth = 4;
    cellHeight = 4;
    aspectRatio = 1.45;
  } else if (n > 5000) {
    cellWidth = 5;
    gutter = 3;
    aspectRatio = 1.45;
  } else if (n > 1000) {
    gutter = 3;
    cellWidth = 8;
    aspectRatio = 1.3;
  }

  if (n < 25) {
    blockSize = n;
  } else {
    blockSize = Math.sqrt(n * (cellWidth + gutter) / cellHeight / aspectRatio) | 0;
  }

  for (var i=0; i<n; i++) {
    row = i % blockSize;
    col = Math.floor(i / blockSize);
    x = col * (cellWidth + gutter);
    y = cellHeight * (blockSize - row);
    if (usePoints) {
      shapes.push([[x, y]]);
    } else {
      arcs.push(getArc(x, y, cellWidth, cellHeight));
      shapes.push([[i]]);
    }
  }

  if (usePoints) {
    lyr.geometry_type = 'point';
  } else {
    data.arcs = new internal.ArcCollection(arcs);
    lyr.geometry_type = 'polygon';
  }
  lyr.data = table;

  function getArc(x, y, w, h) {
    return [[x, y], [x + w, y], [x + w, y - h], [x, y - h], [x, y]];
  }

  return data;
};




function DisplayLayer(lyr, dataset, ext) {
  var _displayBounds;
  var _arcCounts;

  this.getLayer = function() {return lyr;};

  this.getBounds = function() {
    return _displayBounds;
  };

  this.setRetainedPct = function(pct) {
    var arcs = dataset.filteredArcs || dataset.arcs;
    if (arcs) {
      arcs.setRetainedPct(pct);
    }
  };

  // @ext map extent
  this.getDisplayLayer = function() {
    var arcs = lyr.display.arcs,
        layer = lyr.display.layer || lyr;
    if (!arcs) {
      // use filtered arcs if available & map extent is known
      arcs = dataset.filteredArcs ?
        dataset.filteredArcs.getArcCollection(ext) : dataset.arcs;
    }
    return {
      layer: layer,
      dataset: {arcs: arcs},
      geographic: layer == lyr // false if using table-only shapes
    };
  };

  this.draw = function(canv, style) {
    if (style.type == 'outline') {
      this.drawStructure(canv, style);
    } else {
      this.drawShapes(canv, style);
    }
  };

  this.drawStructure = function(canv, style) {
    var obj = this.getDisplayLayer(ext);
    var arcs = obj.dataset.arcs;
    var darkStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[1]},
        lightStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[0]};
    var filter;
    if (arcs && _arcCounts) {
      if (lightStyle.strokeColor) {
        filter = getArcFilter(arcs, ext, false, _arcCounts);
        canv.drawArcs(arcs, lightStyle, filter);
      }
      if (darkStyle.strokeColor && obj.layer.geometry_type != 'point') {
        filter = getArcFilter(arcs, ext, true, _arcCounts);
        canv.drawArcs(arcs, darkStyle, filter);
      }
    }
    if (obj.layer.geometry_type == 'point') {
      canv.drawSquareDots(obj.layer.shapes, style);
    }
  };

  this.drawShapes = function(canv, style) {
    // TODO: add filter for out-of-view shapes
    var obj = this.getDisplayLayer(ext);
    var lyr = style.ids ? filterLayer(obj.layer, style.ids) : obj.layer;
    if (lyr.geometry_type == 'point') {
      if (style.type == 'styled') {
        canv.drawPoints(lyr.shapes, style);
      } else {
        canv.drawSquareDots(lyr.shapes, style);
      }
    } else {
      canv.drawPathShapes(lyr.shapes, obj.dataset.arcs, style);
    }
  };

  function getArcFilter(arcs, ext, usedFlag, arcCounts) {
    var minPathLen = 0.5 * ext.getPixelSize(),
        geoBounds = ext.getBounds(),
        geoBBox = geoBounds.toArray(),
        allIn = geoBounds.contains(arcs.getBounds()),
        visible;
    // don't continue dropping paths if user zooms out farther than full extent
    if (ext.scale() < 1) minPathLen *= ext.scale();
    return function(i) {
      var visible = true;
      if (usedFlag != arcCounts[i] > 0) { // show either used or unused arcs
        visible = false;
      } else if (arcs.arcIsSmaller(i, minPathLen)) {
        visible = false;
      } else if (!allIn && !arcs.arcIntersectsBBox(i, geoBBox)) {
        visible = false;
      }
      return visible;
    };
  }

  function filterLayer(lyr, ids) {
    if (lyr.shapes) {
      shapes = ids.map(function(id) {
        return lyr.shapes[id];
      });
      return utils.defaults({shapes: shapes}, lyr);
    }
    return lyr;
  }

  function initArcCounts(self) {
    var o = self.getDisplayLayer();
    _arcCounts = o.dataset.arcs ? new Uint8Array(o.dataset.arcs.size()) : null;
    if (internal.layerHasPaths(o.layer)) {
      internal.countArcsInShapes(o.layer.shapes, _arcCounts);
    }
  }

  function init(self) {
    var display = lyr.display = lyr.display || {};

    // init filtered arcs, if needed
    if (internal.layerHasPaths(lyr) && !dataset.filteredArcs) {
      dataset.filteredArcs = new FilteredArcCollection(dataset.arcs);
    }

    // init table shapes, if needed
    if (lyr.data && !lyr.geometry_type) {
      if (!display.layer || display.layer.shapes.length != lyr.data.size()) {
        utils.extend(display, gui.getDisplayLayerForTable(lyr.data));
      }
    } else if (display.layer) {
      delete display.layer;
      delete display.arcs;
    }

    _displayBounds = getDisplayBounds(display.layer || lyr, display.arcs || dataset.arcs);
    initArcCounts(self);
  }

  init(this);
}

function getDisplayBounds(lyr, arcs) {
  var arcBounds = arcs ? arcs.getBounds() : new Bounds(),
      bounds = arcBounds, // default display extent: all arcs in the dataset
      lyrBounds;

  if (lyr.geometry_type == 'point') {
    lyrBounds = internal.getLayerBounds(lyr);
    if (lyrBounds && lyrBounds.hasBounds()) {
      if (lyrBounds.area() > 0 || !arcBounds.hasBounds()) {
        bounds = lyrBounds;
      } else {
        // if a point layer has no extent (e.g. contains only a single point),
        // then merge with arc bounds, to place the point in context.
        bounds = arcBounds.mergeBounds(lyrBounds);
      }
    }
  }

  // If a layer has collapsed, inflate it by a default amount
  if (bounds.width() === 0) {
    bounds.xmin = (bounds.centerX() || 0) - 1;
    bounds.xmax = bounds.xmin + 2;
  }
  if (bounds.height() === 0) {
    bounds.ymin = (bounds.centerY() || 0) - 1;
    bounds.ymax = bounds.ymin + 2;
  }
  return bounds;
}




function HighlightBox(el) {
  var stroke = 2,
      box = El('div').addClass('zoom-box').appendTo(el).hide();
  this.show = function(x1, y1, x2, y2) {
    var w = Math.abs(x1 - x2),
        h = Math.abs(y1 - y2);
    box.css({
      top: Math.min(y1, y2),
      left: Math.min(x1, x2),
      width: Math.max(w - stroke * 2, 1),
      height: Math.max(h - stroke * 2, 1)
    });
    box.show();
  };
  this.hide = function() {
    box.hide();
  };
}




gui.addSidebarButton = function(iconId) {
  var btn = El('div').addClass('nav-btn')
    .on('dblclick', function(e) {e.stopPropagation();}); // block dblclick zoom
  btn.appendChild(iconId);
  btn.appendTo('#nav-buttons');
  return btn;
};

function MapNav(root, ext, mouse) {
  var wheel = new MouseWheel(mouse),
      zoomBox = new HighlightBox('body'),
      buttons = El('div').id('nav-buttons').appendTo(root),
      zoomTween = new Tween(Tween.sineInOut),
      shiftDrag = false,
      zoomScale = 2.5,
      dragStartEvt, _fx, _fy; // zoom foci, [0,1]

  gui.addSidebarButton("#home-icon").on('click', function() {
    gui.dispatchEvent('map_reset');
  });
  gui.addSidebarButton("#zoom-in-icon").on('click', zoomIn);
  gui.addSidebarButton("#zoom-out-icon").on('click', zoomOut);

  gui.on('map_reset', function() {
    ext.reset();
  });

  zoomTween.on('change', function(e) {
    ext.rescale(e.value, _fx, _fy);
  });

  mouse.on('dblclick', function(e) {
    zoomByPct(zoomScale, e.x / ext.width(), e.y / ext.height());
  });

  mouse.on('dragstart', function(e) {
    shiftDrag = !!e.shiftKey;
    if (shiftDrag) {
      dragStartEvt = e;
    }
  });

  mouse.on('drag', function(e) {
    if (shiftDrag) {
      zoomBox.show(e.pageX, e.pageY, dragStartEvt.pageX, dragStartEvt.pageY);
    } else {
      ext.pan(e.dx, e.dy);
    }
  });

  mouse.on('dragend', function(e) {
    var bounds;
    if (shiftDrag) {
      shiftDrag = false;
      bounds = new Bounds(e.x, e.y, dragStartEvt.x, dragStartEvt.y);
      zoomBox.hide();
      if (bounds.width() > 5 && bounds.height() > 5) {
        zoomToBox(bounds);
      }
    }
  });

  wheel.on('mousewheel', function(e) {
    var k = 1 + (0.11 * e.multiplier),
        delta = e.direction > 0 ? k : 1 / k;
    ext.rescale(ext.scale() * delta, e.x / ext.width(), e.y / ext.height());
  });

  function zoomIn() {
    zoomByPct(zoomScale, 0.5, 0.5);
  }

  function zoomOut() {
    zoomByPct(1/zoomScale, 0.5, 0.5);
  }

  // @box Bounds with pixels from t,l corner of map area.
  function zoomToBox(box) {
    var pct = Math.max(box.width() / ext.width(), box.height() / ext.height()),
        fx = box.centerX() / ext.width() * (1 + pct) - pct / 2,
        fy = box.centerY() / ext.height() * (1 + pct) - pct / 2;
    zoomByPct(1 / pct, fx, fy);
  }

  // @pct Change in scale (2 = 2x zoom)
  // @fx, @fy zoom focus, [0, 1]
  function zoomByPct(pct, fx, fy) {
    _fx = fx;
    _fy = fy;
    zoomTween.start(ext.scale(), ext.scale() * pct, 400);
  }

}




function MapExtent(el) {
  var _position = new ElementPosition(el),
      _scale = 1,
      _cx,
      _cy,
      _contentBounds;

  _position.on('resize', function() {
    this.dispatchEvent('change');
    this.dispatchEvent('navigate');
    this.dispatchEvent('resize');
  }, this);

  this.reset = function(force) {
    this.recenter(_contentBounds.centerX(), _contentBounds.centerY(), 1, force);
  };

  this.recenter = function(cx, cy, scale, force) {
    if (!scale) scale = _scale;
    if (force || !(cx == _cx && cy == _cy && scale == _scale)) {
      _cx = cx;
      _cy = cy;
      _scale = scale;
      this.dispatchEvent('change');
      this.dispatchEvent('navigate');
    }
  };

  this.pan = function(xpix, ypix) {
    var t = this.getTransform();
    this.recenter(_cx - xpix / t.mx, _cy - ypix / t.my);
  };

  // Zoom to @scale (a multiple of the map's full scale)
  // @xpct, @ypct: optional focus, [0-1]...
  this.rescale = function(scale, xpct, ypct) {
    if (arguments.length < 3) {
      xpct = 0.5;
      ypct = 0.5;
    }
    var b = this.getBounds(),
        fx = b.xmin + xpct * b.width(),
        fy = b.ymax - ypct * b.height(),
        dx = b.centerX() - fx,
        dy = b.centerY() - fy,
        ds = _scale / scale,
        dx2 = dx * ds,
        dy2 = dy * ds,
        cx = fx + dx2,
        cy = fy + dy2;
    this.recenter(cx, cy, scale);
  };

  this.resize = _position.resize;
  this.width = _position.width;
  this.height = _position.height;
  this.position = _position.position;

  // get zoom factor (1 == full extent, 2 == 2x zoom, etc.)
  this.scale = function() {
    return _scale;
  };

  this.getPixelSize = function() {
    return 1 / this.getTransform().mx;
  };

  // Get params for converting geographic coords to pixel coords
  this.getTransform = function(pixScale) {
    // get transform (y-flipped);
    var viewBounds = new Bounds(0, 0, _position.width(), _position.height());
    if (pixScale) {
      viewBounds.xmax *= pixScale;
      viewBounds.ymax *= pixScale;
    }
    return this.getBounds().getTransform(viewBounds, true);
  };

  this.getBounds = function() {
    if (!_contentBounds) return new Bounds();
    return centerAlign(calcBounds(_cx, _cy, _scale));
  };

  // Update the extent of 'full' zoom without navigating the current view
  this.setBounds = function(b) {
    var prev = _contentBounds;
    _contentBounds = b;
    if (prev) {
      _scale = _scale * centerAlign(b).width() / centerAlign(prev).width();
    } else {
      _cx = b.centerX();
      _cy = b.centerY();
    }
  };

  function getPadding(size) {
    return size * 0.020 + 4;
  }

  function calcBounds(cx, cy, scale) {
    var w = _contentBounds.width() / scale,
        h = _contentBounds.height() / scale;
    return new Bounds(cx - w/2, cy - h/2, cx + w/2, cy + h/2);
  }

  // Receive: Geographic bounds of content to be centered in the map
  // Return: Geographic bounds of map window centered on @_contentBounds,
  //    with padding applied
  function centerAlign(_contentBounds) {
    var bounds = _contentBounds.clone(),
        wpix = _position.width(),
        hpix = _position.height(),
        xmarg = getPadding(wpix),
        ymarg = getPadding(hpix),
        xpad, ypad;
    wpix -= 2 * xmarg;
    hpix -= 2 * ymarg;
    if (wpix <= 0 || hpix <= 0) {
      return new Bounds(0, 0, 0, 0);
    }
    bounds.fillOut(wpix / hpix);
    xpad = bounds.width() / wpix * xmarg;
    ypad = bounds.height() / hpix * ymarg;
    bounds.padBounds(xpad, ypad, xpad, ypad);
    return bounds;
  }
}

utils.inherit(MapExtent, EventDispatcher);




function HitControl(ext, mouse) {
  var self = new EventDispatcher();
  var prevHits = [];
  var active = false;
  var tests = {
    polygon: polygonTest,
    polyline: polylineTest,
    point: pointTest
  };
  var readout = El('#coordinate-info').hide();
  var bboxPoint;
  var lyr, target, test;

  readout.on('copy', function(e) {
    // remove selection on copy (using timeout or else copy is cancelled)
    setTimeout(function() {
      getSelection().removeAllRanges();
    }, 50);
    // don't display bounding box if user copies coords
    bboxPoint = null;
  });

  ext.on('change', function() {
    clearCoords();
    // shapes may change along with map scale
    target = lyr ? lyr.getDisplayLayer() : null;
  });

  self.setLayer = function(o, style) {
    lyr = o;
    target = o.getDisplayLayer();
    if (target.layer.geometry_type == 'point' && style.type == 'styled') {
      test = getGraduatedCircleTest(getRadiusFunction(style));
    } else {
      test = tests[target.layer.geometry_type];
    }
    readout.hide();
  };

  self.start = function() {
    active = true;
  };

  self.stop = function() {
    if (active) {
      hover([]);
      // readout.text('').hide();
      active = false;
    }
  };

  mouse.on('click', function(e) {
    if (!target) return;
    if (active) {
      trigger('click', prevHits);
    }
    if (target.geographic) {
      gui.selectElement(readout.node());
      // don't save bbox point when inspector is active
      // clear bbox point if already present
      bboxPoint = bboxPoint || active ? null : getPointerCoords(e);
    }

  });

  // DISABLING: This causes problems when hovering over the info panel
  // Deselect hover shape when pointer leaves hover area
  //mouse.on('leave', function(e) {
  // hover(-1);
  //});

  mouse.on('leave', clearCoords);

  mouse.on('hover', function(e) {
    var p;
    if (!target) return;
    p = getPointerCoords(e);
    if (target.geographic) {
      // update coordinate readout if displaying geographic shapes
      displayCoords(p);
    } else {
      clearCoords();
    }
    if (active && test && e.hover) {
      hover(test(p[0], p[1]));
    }
  });

  function getPointerCoords(e) {
    return ext.getTransform().invert().transform(e.x, e.y);
  }

  function displayCoords(p) {
    var decimals = getCoordPrecision(ext.getBounds());
    var coords = bboxPoint ? getBbox(p, bboxPoint) : p;
    var str = coords.map(function(n) {return n.toFixed(decimals);}).join(',');
    readout.text(str).show();
  }

  function getBbox(a, b) {
    return [
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.max(a[0], b[0]),
      Math.max(a[1], b[1])
    ];
  }

  function clearCoords() {
    bboxPoint = null;
    readout.hide();
  }

  // Convert pixel distance to distance in coordinate units.
  function getHitBuffer(pix) {
    return pix / ext.getTransform().mx;
  }

  // reduce hit threshold when zoomed out
  function getHitBuffer2(pix) {
    var scale = ext.scale();
    if (scale > 1) scale = 1;
    return getHitBuffer(pix) * scale;
  }

  function getCoordPrecision(bounds) {
    var min = Math.min(Math.abs(bounds.xmax), Math.abs(bounds.ymax)),
        decimals = Math.ceil(Math.log(min) / Math.LN10);
    return Math.max(0, 7 - decimals);
  }

  function polygonTest(x, y) {
    var dist = getHitBuffer2(5),
        cands = findHitCandidates(x, y, dist),
        hits = [],
        cand, hitId;
    for (var i=0; i<cands.length; i++) {
      cand = cands[i];
      if (geom.testPointInPolygon(x, y, cand.shape, target.dataset.arcs)) {
        hits.push(cand.id);
      }
    }
    if (cands.length > 0 && hits.length === 0) {
      // secondary detection: proximity, if not inside a polygon
      hits = findNearestCandidates(x, y, dist, cands, target.dataset.arcs);
    }
    return hits;
  }

  function polylineTest(x, y) {
    var dist = getHitBuffer2(15),
        cands = findHitCandidates(x, y, dist);
    return findNearestCandidates(x, y, dist, cands, target.dataset.arcs);
  }

  function findNearestCandidates(x, y, dist, cands, arcs) {
    var hits = [],
        cand, candDist;
    for (var i=0; i<cands.length; i++) {
      cand = cands[i];
      candDist = geom.getPointToShapeDistance(x, y, cand.shape, arcs);
      if (candDist < dist) {
        hits = [cand.id];
        dist = candDist;
      } else if (candDist == dist) {
        hits.push(cand.id);
      }
    }
    return hits;
  }

  function pointTest(x, y) {
    var dist = getHitBuffer2(25),
        limitSq = dist * dist,
        hits = [];
    internal.forEachPoint(target.layer.shapes, function(p, id) {
      var distSq = geom.distanceSq(x, y, p[0], p[1]);
      if (distSq < limitSq) {
        hits = [id];
        limitSq = distSq;
      } else if (distSq == limitSq) {
        hits.push(id);
      }
    });
    return hits;
  }

  function getRadiusFunction(style) {
    var o = {};
    if (style.styler) {
      return function(i) {
        style.styler(o, i);
        return o.radius || 0;
      };
    }
    return function() {return style.radius || 0;};
  }

  function getGraduatedCircleTest(radius) {
    return function(x, y) {
      var hits = [],
          margin = getHitBuffer(12),
          limit = getHitBuffer(50), // short-circuit hit test beyond this threshold
          directHit = false,
          hitRadius = 0,
          hitDist;
      internal.forEachPoint(target.layer.shapes, function(p, id) {
        var distSq = geom.distanceSq(x, y, p[0], p[1]);
        var isHit = false;
        var isOver, isNear, r, d, rpix;
        if (distSq > limit * limit) return;
        rpix = radius(id);
        r = getHitBuffer(rpix + 1); // increase effective radius to make small bubbles easier to hit in clusters
        d = Math.sqrt(distSq) - r; // pointer distance from edge of circle (negative = inside)
        isOver = d < 0;
        isNear = d < margin;
        if (!isNear || rpix > 0 === false) {
          isHit = false;
        } else if (hits.length === 0) {
          isHit = isNear;
        } else if (!directHit && isOver) {
          isHit = true;
        } else if (directHit && isOver) {
          isHit = r == hitRadius ? d <= hitDist : r < hitRadius; // smallest bubble wins if multiple direct hits
        } else if (!directHit && !isOver) {
          // closest to bubble edge wins
          isHit = hitDist == d ? r <= hitRadius : d < hitDist; // closest bubble wins if multiple indirect hits
        }
        if (isHit) {
          if (hits.length > 0 && (r != hitRadius || d != hitDist)) {
            hits = [];
          }
          hitRadius = r;
          hitDist = d;
          directHit = isOver;
          hits.push(id);
        }
      });
      return hits;
    };
  }

  function getProperties(id) {
    return target.layer.data ? target.layer.data.getRecordAt(id) : {};
  }

  function sameIds(a, b) {
    if (a.length != b.length) return false;
    for (var i=0; i<a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function trigger(event, hits) {
    self.dispatchEvent(event, {
      ids: hits,
      id: hits.length > 0 ? hits[0] : -1
    });
  }

  function hover(hits) {
    if (!sameIds(hits, prevHits)) {
      prevHits = hits;
      El('#map-layers').classed('hover', hits.length > 0);
      trigger('hover', hits);
    }
  }

  function findHitCandidates(x, y, dist) {
    var arcs = target.dataset.arcs,
        index = {},
        cands = [],
        bbox = [];
    target.layer.shapes.forEach(function(shp, shpId) {
      var cand;
      for (var i = 0, n = shp && shp.length; i < n; i++) {
        arcs.getSimpleShapeBounds2(shp[i], bbox);
        if (x + dist < bbox[0] || x - dist > bbox[2] ||
          y + dist < bbox[1] || y - dist > bbox[3]) {
          continue; // bbox non-intersection
        }
        cand = index[shpId];
        if (!cand) {
          cand = index[shpId] = {shape: [], id: shpId};
          cands.push(cand);
        }
        cand.shape.push(shp[i]);
      }
    });
    return cands;
  }

  return self;
}





function Popup() {
  var parent = El('#mshp-main-map');
  var el = El('div').addClass('popup').appendTo(parent).hide();
  // var head = El('div').addClass('popup-head').appendTo(el).text('Feature 1 of 5  next prev');
  var content = El('div').addClass('popup-content').appendTo(el);

  this.show = function(rec, table, editable) {
    var maxHeight = parent.node().clientHeight - 36;
    this.hide(); // clean up if panel is already open
    render(content, rec, table, editable);
    el.show();
    if (content.node().clientHeight > maxHeight) {
      content.css('height:' + maxHeight + 'px');
    }
  };

  this.hide = function() {
    // make sure any pending edits are made before re-rendering popup
    // TODO: only blur popup fields
    gui.blurActiveElement();
    content.empty();
    content.node().removeAttribute('style'); // remove inline height
    el.hide();
  };

  function render(el, rec, table, editable) {
    var tableEl = El('table').addClass('selectable'),
        rows = 0;
    utils.forEachProperty(rec, function(v, k) {
      var type = internal.getFieldType(v, k, table);
      if (v !== undefined) {
        renderRow(tableEl, rec, k, type, editable);
        rows++;
      }
    });
    if (rows > 0) {
      tableEl.appendTo(el);
    } else {
      el.html('<div class="note">This layer is missing attribute data.</div>');
    }
  }

  function renderRow(table, rec, key, type, editable) {
    var rowHtml = '<td class="field-name">%s</td><td><span class="value">%s</span> </td>';
    var val = rec[key];
    var str = internal.formatInspectorValue(val, type);
    var cell = El('tr')
        .appendTo(table)
        .html(utils.format(rowHtml, key, utils.htmlEscape(str)))
        .findChild('.value');
    setFieldClass(cell, val, type);
    if (editable) {
      editItem(cell, rec, key, type);
    }
  }

  function setFieldClass(el, val, type) {
    var isNum = type ? type == 'number' : utils.isNumber(val);
    var isNully = val === undefined || val === null || val !== val;
    var isEmpty = val === '';
    el.classed('num-field', isNum);
    el.classed('object-field', type == 'object');
    el.classed('null-value', isNully);
    el.classed('empty', isEmpty);
  }

  function editItem(el, rec, key, type) {
    var input = new ClickText2(el),
        strval = internal.formatInspectorValue(rec[key], type),
        parser = internal.getInputParser(type);
    el.parent().addClass('editable-cell');
    el.addClass('colored-text dot-underline');
    input.on('change', function(e) {
      var val2 = parser(input.value()),
          strval2 = internal.formatInspectorValue(val2, type);
      if (strval == strval2) {
        // contents unchanged
      } else if (val2 === null && type != 'object') { // allow null objects
        // invalid value; revert to previous value
        input.value(strval);
      } else {
        // field content has changed;
        strval = strval2;
        rec[key] = val2;
        input.value(strval);
        setFieldClass(el, val2, type);
      }
    });
  }
}

internal.formatInspectorValue = function(val, type) {
  var str;
  if (type == 'object') {
    str = val ? JSON.stringify(val) : "";
  } else {
    str = String(val);
  }
  return str;
};

internal.inputParsers = {
  string: function(raw) {
    return raw;
  },
  number: function(raw) {
    var val = Number(raw);
    if (raw == 'NaN') {
      val = NaN;
    } else if (isNaN(val)) {
      val = null;
    }
    return val;
  },
  object: function(raw) {
    var val = null;
    try {
      val = JSON.parse(raw);
    } catch(e) {}
    return val;
  },
  boolean: function(raw) {
    var val = null;
    if (raw == 'true') {
      val = true;
    } else if (raw == 'false') {
      val = false;
    }
    return val;
  },
  multiple: function(raw) {
    var val = Number(raw);
    return isNaN(val) ? raw : val;
  }
};

internal.getInputParser = function(type) {
  return internal.inputParsers[type || 'multiple'];
};

internal.getFieldType = function(val, key, table) {
  // if a field has a null value, look at entire column to identify type
  return internal.getValueType(val) || internal.getColumnType(key, table);
};




function InspectionControl(model, hit) {
  var _popup = new Popup();
  var _inspecting = false;
  var _pinned = false;
  var _highId = -1;
  var _selectionIds = null;
  var btn = gui.addSidebarButton("#info-icon2").on('click', function() {
    gui.dispatchEvent('inspector_toggle');
  });
  var _self = new EventDispatcher();
  var _shapes, _lyr;

  gui.on('inspector_toggle', function() {
    if (_inspecting) turnOff(); else turnOn();
  });

  _self.updateLayer = function(o, style) {
    var shapes = o.getDisplayLayer().layer.shapes;
    if (_inspecting) {
      // kludge: check if shapes have changed
      if (_shapes == shapes) {
        // kludge: re-display the inspector, in case data changed
        inspect(_highId, _pinned);
      } else {
        _selectionIds = null;
        inspect(-1, false);
      }
    }
    hit.setLayer(o, style);
    _shapes = shapes;
    _lyr = o;
  };

  // replace cli inspect command
  api.inspect = function(lyr, arcs, opts) {
    var ids;
    if (lyr != model.getActiveLayer().layer) {
      error("Only the active layer can be targeted");
    }
    ids = internal.selectFeatures(lyr, arcs, opts);
    if (ids.length === 0) {
      message("No features were selected");
      return;
    }
    _selectionIds = ids;
    turnOn();
    inspect(ids[0], true);
  };

  document.addEventListener('keydown', function(e) {
    var kc = e.keyCode, n, id;
    if (!_inspecting) return;

    // esc key closes (unless in an editing mode)
    if (e.keyCode == 27 && _inspecting && !gui.getMode()) {
      turnOff();

    // arrow keys advance pinned feature unless user is editing text.
    } else if ((kc == 37 || kc == 39) && _pinned && !gui.getInputElement()) {
      n = internal.getFeatureCount(_lyr.getDisplayLayer().layer);
      if (n > 1) {
        if (kc == 37) {
          id = (_highId + n - 1) % n;
        } else {
          id = (_highId + 1) % n;
        }
        inspect(id, true);
        e.stopPropagation();
      }
    }
  }, !!'capture'); // preempt the layer control's arrow key handler

  hit.on('click', function(e) {
    var id = e.id;
    var pin = false;
    if (_pinned && id == _highId) {
      // clicking on pinned shape: unpin
    } else if (!_pinned && id > -1) {
      // clicking on unpinned shape while unpinned: pin
      pin = true;
    } else if (_pinned && id > -1) {
      // clicking on unpinned shape while pinned: pin new shape
      pin = true;
    } else if (!_pinned && id == -1) {
      // clicking off the layer while pinned: unpin and deselect
    }
    inspect(id, pin, e.ids);
  });

  hit.on('hover', function(e) {
    var id = e.id;
    if (!_inspecting || _pinned) return;
    inspect(id, false, e.ids);
  });

  function showInspector(id, editable) {
    var o = _lyr.getDisplayLayer();
    var table = o.layer.data || null;
    var rec = table ? table.getRecordAt(id) : {};
    _popup.show(rec, table, editable);
  }

  // @id Id of a feature in the active layer, or -1
  function inspect(id, pin, ids) {
    if (!_inspecting) return;
    if (id > -1) {
      showInspector(id, pin);
    } else {
      _popup.hide();
    }
    _highId = id;
    _pinned = pin;
    _self.dispatchEvent('change', {
      selection_ids: _selectionIds || [],
      hover_ids: ids || [],
      id: id,
      pinned: pin
    });
  }

  function turnOn() {
    btn.addClass('selected');
    _inspecting = true;
    hit.start();
  }

  function turnOff() {
    btn.removeClass('selected');
    hit.stop();
    _selectionIds = null;
    inspect(-1); // clear the map
    _inspecting = false;
  }

  return _self;
}




var MapStyle = (function() {
  var darkStroke = "#334",
      lightStroke = "#b7d9ea",
      pink = "#f74b80",  // dark
      pink2 = "rgba(239, 0, 86, 0.16)", // "#ffd9e7", // medium
      gold = "#efc100",
      black = "black",
      selectionFill = "rgba(237, 214, 0, 0.12)",
      hoverFill = "rgba(255, 117, 165, 0.18)",
      outlineStyle = {
        type: 'outline',
        strokeColors: [lightStroke, darkStroke],
        strokeWidth: 0.7,
        dotColor: "#223"
      },
      referenceStyle = {
        type: 'outline',
        strokeColors: [null, '#86c927'],
        strokeWidth: 0.85,
        dotColor: "#73ba20"
      },
      highStyle = {
        dotColor: "#F24400"
      },
      hoverStyles = {
        polygon: {
          fillColor: hoverFill,
          strokeColor: black,
          strokeWidth: 1.2
        }, point:  {
          dotColor: black,
          dotSize: 8
        }, polyline:  {
          strokeColor: black,
          strokeWidth: 2.5
        }
      },
      selectionStyles = {
        polygon: {
          fillColor: selectionFill,
          strokeColor: gold,
          strokeWidth: 1
        }, point:  {
          dotColor: gold,
          dotSize: 6
        }, polyline:  {
          strokeColor: gold,
          strokeWidth: 1.5
        }
      },
      selectionHoverStyles = {
        polygon: {
          fillColor: selectionFill,
          strokeColor: black,
          strokeWidth: 1.2
        }, point:  {
          dotColor: black,
          dotSize: 6
        }, polyline:  {
          strokeColor: black,
          strokeWidth: 2
        }
      },
      pinnedStyles = {
        polygon: {
          fillColor: pink2,
          strokeColor: pink,
          strokeWidth: 1.6
        }, point:  {
          dotColor: pink,
          dotSize: 7
        }, polyline:  {
          strokeColor: pink,
          strokeWidth: 3
        }
      };

  return {
    getHighlightStyle: function(lyr) {
      var style = utils.extend({}, highStyle);
      var n = internal.countPointsInLayer(lyr);
      style.dotSize = n < 20 && 4 || n < 500 && 3 || 2;
      return style;
    },
    getReferenceStyle: function(lyr) {
      var style = utils.extend({}, referenceStyle);
      style.dotSize = calcDotSize(internal.countPointsInLayer(lyr));
      return style;
    },
    getActiveStyle: function(lyr) {
      var style;
      if (internal.layerHasSvgDisplayStyle(lyr)) {
        style = internal.getSvgDisplayStyle(lyr);
      } else {
        style = utils.extend({}, outlineStyle);
        style.dotSize = calcDotSize(internal.countPointsInLayer(lyr));
      }
      return style;
    },
    getOverlayStyle: getOverlayStyle
  };

  function calcDotSize(n) {
    return n < 20 && 5 || n < 500 && 4 || n < 50000 && 3 || 2;
  }

  function getOverlayStyle(lyr, o) {
    var type = lyr.geometry_type;
    var topId = o.id;
    var ids = [];
    var styles = [];
    var styler = function(o, i) {
      utils.extend(o, styles[i]);
    };
    var overlayStyle = {
      styler: styler
    };
    // first layer: selected feature(s)
    o.selection_ids.forEach(function(i) {
      // skip features in a higher layer
      if (i == topId || o.hover_ids.indexOf(i) > -1) return;
      ids.push(i);
      styles.push(selectionStyles[type]);
    });
    // second layer: hover feature(s)
    o.hover_ids.forEach(function(i) {
      var style;
      if (i == topId) return;
      style = o.selection_ids.indexOf(i) > -1 ? selectionHoverStyles[type] : hoverStyles[type];
      ids.push(i);
      styles.push(style);
    });
    // top layer: highlighted feature
    if (topId > -1) {
      var isPinned = o.pinned;
      var inSelection = o.selection_ids.indexOf(topId) > -1;
      var style;
      if (isPinned) {
        style = pinnedStyles[type];
      } else if (inSelection) {
        style = selectionHoverStyles[type]; // TODO: differentiate from other hover ids
      } else {
        style = hoverStyles[type]; // TODO: differentiate from other hover ids
      }
      ids.push(topId);
      styles.push(style);
    }

    if (internal.layerHasSvgDisplayStyle(lyr)) {
      if (type == 'point') {
        overlayStyle = internal.wrapOverlayStyle(internal.getSvgDisplayStyle(lyr), overlayStyle);
      }
      overlayStyle.type = 'styled';
    }
    overlayStyle.ids = ids;
    return ids.length > 0 ? overlayStyle : null;
  }

}());

// Modify style to use scaled circle instead of dot symbol
internal.wrapOverlayStyle = function(style, hoverStyle) {
  var styler = function(obj, i) {
    var dotColor;
    var id = obj.ids ? obj.ids[i] : -1;
    obj.strokeWidth = 0; // kludge to support setting minimum stroke width
    style.styler(obj, id);
    if (hoverStyle.styler) {
      hoverStyle.styler(obj, i);
    }
    dotColor = obj.dotColor;
    if (obj.radius && dotColor) {
      obj.radius += 0.4;
      delete obj.fillColor; // only show outline
      // obj.fillColor = dotColor; // comment out to only highlight stroke
      obj.strokeColor = dotColor;
      obj.strokeWidth = Math.max(obj.strokeWidth + 0.8, 1.5);
      obj.opacity = 1;
    }
  };
  return {styler: styler};
};

internal.getSvgDisplayStyle = function(lyr) {
  var records = lyr.data.getRecords(),
      fields = internal.getSvgStyleFields(lyr),
      index = internal.svgStyles;
  var styler = function(style, i) {
    var f, key, val, rec;
    for (var j=0; j<fields.length; j++) {
      f = fields[j];
      key = index[f];
      rec = records[i];
      val = rec && rec[f];
      if (val == 'none') {
        val = 'transparent'; // canvas equivalent
      }
      style[key] = val;
    }

    // TODO: make sure canvas rendering matches svg output
    if (('strokeWidth' in style) && !style.strokeColor) {
      style.strokeColor = 'black';
    } else if (!('strokeWidth' in style) && style.strokeColor) {
      style.strokeWidth = 1;
    }
    if (('radius' in style) && !style.strokeColor && !style.fillColor &&
      lyr.geometry_type == 'point') {
      style.fillColor = 'black';
    }
  };
  return {styler: styler, type: 'styled'};
};





// Test if map should be re-framed to show updated layer
gui.mapNeedsReset = function(newBounds, prevBounds, mapBounds) {
  if (!prevBounds) return true;
  if (prevBounds.xmin === 0 || newBounds.xmin === 0) return true; // kludge to handle tables
  var viewportPct = gui.getIntersectionPct(newBounds, mapBounds);
  var contentPct = gui.getIntersectionPct(mapBounds, newBounds);
  var boundsChanged = !prevBounds.equals(newBounds);
  var inView = newBounds.intersects(mapBounds);
  var areaChg = newBounds.area() / prevBounds.area();
  if (!boundsChanged) return false; // don't reset if layer extent hasn't changed
  if (!inView) return true; // reset if layer is out-of-view
  if (viewportPct < 0.3 && contentPct < 0.9) return true; // reset if content is mostly offscreen
  if (areaChg > 1e8 || areaChg < 1e-8) return true; // large area chg, e.g. after projection
  return false;
};

// TODO: move to utilities file
gui.getBoundsIntersection = function(a, b) {
  var c = new Bounds();
  if (a.intersects(b)) {
    c.setBounds(Math.max(a.xmin, b.xmin), Math.max(a.ymin, b.ymin),
    Math.min(a.xmax, b.xmax), Math.min(a.ymax, b.ymax));
  }
  return c;
};

// Returns proportion of bb2 occupied by bb1
gui.getIntersectionPct = function(bb1, bb2) {
  return gui.getBoundsIntersection(bb1, bb2).area() / bb2.area() || 0;
};


function MshpMap(model) {
  var _root = El('#mshp-main-map'),
      _layers = El('#map-layers'),
      _ext = new MapExtent(_layers),
      _mouse = new MouseArea(_layers.node()),
      _nav = new MapNav(_root, _ext, _mouse),
      _inspector = new InspectionControl(model, new HitControl(_ext, _mouse));

  var _referenceCanv = new DisplayCanvas().appendTo(_layers), // comparison layer
      _activeCanv = new DisplayCanvas().appendTo(_layers), // data layer shapes
      _overlayCanv = new DisplayCanvas().appendTo(_layers), // hover and selection shapes
      _annotationCanv = new DisplayCanvas().appendTo(_layers), // used for line intersections
      _annotationLyr, _annotationStyle,
      _referenceLyr, _referenceStyle,
      _activeLyr, _activeStyle, _overlayStyle;

  _ext.on('change', drawLayers);

  _inspector.on('change', function(e) {
    var lyr = _activeLyr.getDisplayLayer().layer;
    _overlayStyle = MapStyle.getOverlayStyle(lyr, e);
    drawLayer(_activeLyr, _overlayCanv, _overlayStyle);
  });

  model.on('select', function(e) {
    _annotationStyle = null;
    _overlayStyle = null;
  });

  model.on('update', function(e) {
    var prevBounds = _activeLyr ?_activeLyr.getBounds() : null,
        needReset = false;
    if (arcsMayHaveChanged(e.flags)) {
      // regenerate filtered arcs when simplification thresholds are calculated
      // or arcs are updated
      delete e.dataset.filteredArcs;

      // reset simplification after projection (thresholds have changed)
      // TODO: preserve simplification pct (need to record pct before change)
      if (e.flags.proj && e.dataset.arcs) {
        e.dataset.arcs.setRetainedPct(1);
      }
    }

    _activeLyr = initActiveLayer(e);
    needReset = gui.mapNeedsReset(_activeLyr.getBounds(), prevBounds, _ext.getBounds());
    _ext.setBounds(_activeLyr.getBounds()); // update map extent to match bounds of active group
    if (needReset) {
      // zoom to full view of the active layer and redraw
      _ext.reset(true);
    } else {
      // refresh without navigating
      drawLayers();
    }
  });

  this.setReferenceLayer = function(lyr, dataset) {
    if (lyr) {
      _referenceLyr = new DisplayLayer(lyr, dataset, _ext);
      _referenceStyle = MapStyle.getReferenceStyle(lyr);
    } else if (_referenceLyr) {
      _referenceStyle = null;
      _referenceLyr = null;

    }
    drawLayers(); // draw all layers (reference layer can change how active layer is drawn)
  };

  // Currently used to show dots at line intersections
  this.setHighlightLayer = function(lyr, dataset) {
    if (lyr) {
      _annotationLyr = new DisplayLayer(lyr, dataset, _ext);
      _annotationStyle = MapStyle.getHighlightStyle(lyr);
    } else {
      _annotationStyle = null;
      _annotationLyr = null;
    }
    drawLayer(_annotationLyr, _annotationCanv, _annotationStyle); // also hides
  };

  // lightweight way to update simplification of display lines
  // TODO: consider handling this as a model update
  this.setSimplifyPct = function(pct) {
    _activeLyr.setRetainedPct(pct);
    drawLayers();
  };

  function referenceLayerVisible() {
    if (!_referenceLyr ||
        // don't show if same as active layer
        _activeLyr && _activeLyr.getLayer() == _referenceLyr.getLayer() ||
        // or if active layer isn't geographic (kludge)
        _activeLyr && !_activeLyr.getLayer().shapes) {
      return false;
    }
    return true;
  }

  function initActiveLayer(o) {
    var lyr = new DisplayLayer(o.layer, o.dataset, _ext);
    _activeStyle = MapStyle.getActiveStyle(lyr.getDisplayLayer().layer);
    _inspector.updateLayer(lyr, _activeStyle);
    return lyr;
  }

  // Test if an update may have affected the visible shape of arcs
  // @flags Flags from update event
  function arcsMayHaveChanged(flags) {
    return flags.presimplify || flags.simplify || flags.proj ||
      flags.arc_count || flags.repair || flags.clip || flags.erase ||
      flags.slice || flags.affine || false;
  }

  function referenceStyle() {
    return referenceLayerVisible() ? _referenceStyle : null;
  }

  function activeStyle() {
    var style = _activeStyle;
    if (referenceLayerVisible() && _activeStyle.type != 'styled') {
      style = utils.defaults({
        // kludge to hide ghosted layers
        strokeColors: [null, _activeStyle.strokeColors[1]]
      }, _activeStyle);
    }
    return style;
  }

  function drawLayers() {
    // TODO: consider drawing active and reference layers to the same canvas
    drawLayer(_referenceLyr, _referenceCanv, referenceStyle());
    drawLayer(_activeLyr, _overlayCanv, _overlayStyle);
    drawLayer(_activeLyr, _activeCanv, activeStyle());
    drawLayer(_annotationLyr, _annotationCanv, _annotationStyle);
  }

  function drawLayer(lyr, canv, style) {
    if (style) {
      canv.prep(_ext);
      lyr.draw(canv, style);
    } else {
      canv.hide();
    }

  }
}

utils.inherit(MshpMap, EventDispatcher);




function Console(model) {
  var CURSOR = '$ ';
  var PROMPT = 'Enter mapshaper commands or type "tips" for examples and console help';
  var el = El('#console').hide();
  var content = El('#console-buffer');
  var log = El('div').id('console-log').appendTo(content);
  var line = El('div').id('command-line').appendTo(content).text(CURSOR);
  var input = El('span').appendTo(line)
    .addClass('input-field')
    .attr('spellcheck', false)
    .attr('autocorrect', false)
    .attr('contentEditable', true)
    .on('focus', receiveFocus)
    .on('paste', onPaste);
  var history = [];
  var historyId = 0;
  var _isOpen = false;
  var _error = internal.error; // save default error functions...
  var _stop = internal.stop;

  // capture all messages to this console, whether open or closed
  message = internal.message = consoleMessage;

  message(PROMPT);
  document.addEventListener('keydown', onKeyDown);
  new ModeButton('#console-btn', 'console');
  gui.addMode('console', turnOn, turnOff);

  gui.onClick(content, function(e) {
    var targ = El(e.target);
    if (gui.getInputElement() || targ.hasClass('console-message')) {
      // don't focus if user is typing or user clicks content area
    } else {
      input.node().focus();
    }
  });

  function getHistory() {
    var hist;
    try {
      hist = JSON.parse(localStorage.getItem('console_history'));
    } catch(e) {}
    return hist && hist.length > 0 ? hist : [];
  }

  function saveHistory(history) {
    try {
      localStorage.setItem('console_history', JSON.stringify(history.slice(-50)));
    } catch(e) {}
  }

  function toLog(str, cname) {
    var msg = El('div').text(str).appendTo(log);
    if (cname) {
      msg.addClass(cname);
    }
    scrollDown();
  }

  function turnOn() {
    if (!_isOpen && !model.isEmpty()) {
      _isOpen = true;
      stop = internal.stop = consoleStop;
      error = internal.error = consoleError;
      el.show();
      input.node().focus();
      history = getHistory();
    }
  }

  function turnOff() {
    if (_isOpen) {
      _isOpen = false;
      stop = internal.stop = _stop; // restore original error functions
      error = internal.error = _error;
      el.hide();
      input.node().blur();
      saveHistory(history);
    }
  }

  function onPaste(e) {
    // paste plain text (remove any copied HTML tags)
    e.preventDefault();
    var str = (e.originalEvent || e).clipboardData.getData('text/plain');
    document.execCommand("insertHTML", false, str);
  }

  function receiveFocus() {
    placeCursor();
  }

  function placeCursor() {
    var el = input.node();
    var range, selection;
    if (readCommandLine().length > 0) {
      // move cursor to end of text
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false); //collapse the range to the end point.
      selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function scrollDown() {
    var el = content.parent().node();
    el.scrollTop = el.scrollHeight;
  }

  function metaKey(e) {
    return e.metaKey || e.ctrlKey || e.altKey;
  }

  function onKeyDown(e) {
    var kc = e.keyCode,
        inputEl = gui.getInputElement(),
        typing = !!inputEl,
        typingInConsole = inputEl && inputEl == input.node(),
        inputText = readCommandLine(),
        capture = false;

    // esc key
    if (kc == 27) {
      if (typing) {
        inputEl.blur();
      }
      gui.clearMode(); // esc escapes other modes as well
      capture = true;

    // l/r arrow keys while not typing in a text field
    } else if ((kc == 37 || kc == 39) && (!typing || typingInConsole && !inputText)) {
      if (kc == 37) {
        model.selectPrevLayer();
      } else {
        model.selectNextLayer();
      }

    // delete key while not inputting text
    } else if (kc == 8 && !typing) {
      capture = true; // prevent delete from leaving page

    // any key while console is open
    } else if (_isOpen) {
      capture = true;
      if (kc == 13) { // enter
        submit();
      } else if (kc == 9) { // tab
        tabComplete();
      } else if (kc == 38) {
        back();
      } else if (kc == 40) {
        forward();
      } else if (kc == 32 && (!typing || (inputText === '' && typingInConsole))) {
        // space bar closes if nothing has been typed
        gui.clearMode();
      } else if (!typing && e.target != input.node() && !metaKey(e)) {
        // typing returns focus, unless a meta key is down (to allow Cmd-C copy)
        // or user is typing in a different input area somewhere
        input.node().focus();
        capture = false;
      } else {
        // normal typing
        capture = false;
      }

    // various shortcuts (while not typing in an input field or editable el)
    } else if (!typing) {
       if (kc == 32) { // space bar opens console
        capture = true;
        gui.enterMode('console');
      } else if (kc == 73) { // letter i opens inspector
        gui.dispatchEvent('inspector_toggle');
      } else if (kc == 72) { // letter h resets map extent
        gui.dispatchEvent('map_reset');
      }
    }

    if (capture) {
      e.preventDefault();
    }
  }

  // tab-completion for field names
  function tabComplete() {
    var line = readCommandLine(),
        match = /\w+$/.exec(line),
        stub = match ? match[0] : '',
        lyr = model.getActiveLayer().layer,
        names, name;
    if (stub && lyr.data) {
      names = findCompletions(stub, lyr.data.getFields());
      if (names.length > 0) {
        name = utils.getCommonFileBase(names);
        if (name.length > stub.length) {
          toCommandLine(line.substring(0, match.index) + name);
        }
      }
    }
  }

  function findCompletions(str, fields) {
    return fields.filter(function(name) {
      return name.indexOf(str) === 0;
    });
  }

  function readCommandLine() {
    return input.node().textContent.trim();
  }

  function toCommandLine(str) {
    input.node().textContent = str.trim();
    placeCursor();
  }

  function peekHistory(i) {
    var idx = history.length - 1 - (i || 0);
    return idx >= 0 ? history[idx] : null;
  }

  function toHistory(str) {
    if (historyId > 0) { // if we're back in the history stack
      if (peekHistory() === '') {
        // remove empty string (which may have been appended when user started going back)
        history.pop();
      }
      historyId = 0; // move back to the top of the stack
    }
    if (str && str != peekHistory()) {
      history.push(str);
    }
  }

  function fromHistory() {
    toCommandLine(peekHistory(historyId));
  }

  function back() {
    if (history.length === 0) return;
    if (historyId === 0) {
      history.push(readCommandLine());
    }
    historyId = Math.min(history.length - 1, historyId + 1);
    fromHistory();
  }

  function forward() {
    if (historyId <= 0) return;
    historyId--;
    fromHistory();
    if (historyId === 0) {
      history.pop();
    }
  }

  function clear() {
    log.empty();
    scrollDown();
  }

  function getCommandFlags(commands) {
    return commands.reduce(function(memo, cmd) {
      memo[cmd.name] = true;
      return memo;
    }, {});
  }

  function submit() {
    var cmd = readCommandLine();
    toCommandLine('');
    toLog(CURSOR + cmd);
    if (cmd) {
      if (cmd == 'clear') {
        clear();
      } else if (cmd == 'tips') {
        printExamples();
      } else if (cmd == 'layers') {
        message("Available layers:",
          internal.getFormattedLayerList(model));
      } else if (cmd == 'close' || cmd == 'exit' || cmd == 'quit') {
        gui.clearMode();
      } else if (cmd) {
        runMapshaperCommands(cmd);
      }
      toHistory(cmd);
    }
  }

  function runMapshaperCommands(str) {
    var commands;
    try {
      commands = internal.parseConsoleCommands(str);
      commands = internal.runAndRemoveInfoCommands(commands);
    } catch (e) {
      return onError(e);
    }
    if (commands.length > 0) {
      applyParsedCommands(commands);
    }
  }

  function applyParsedCommands(commands) {
    var active = model.getActiveLayer(),
        prevArcs = active.dataset.arcs,
        prevArcCount = prevArcs ? prevArcs.size() : 0;

    internal.runParsedCommands(commands, model, function(err) {
      var flags = getCommandFlags(commands),
          active2 = model.getActiveLayer(),
          postArcs = active2.dataset.arcs,
          postArcCount = postArcs ? postArcs.size() : 0,
          sameArcs = prevArcs == postArcs && postArcCount == prevArcCount;

      // restore default logging options, in case -quiet or -verbose command was run
      internal.QUIET = false;
      internal.VERBOSE = false;

      // kludge to signal map that filtered arcs need refreshing
      // TODO: find a better solution, outside the console
      if (!sameArcs) {
        flags.arc_count = true;
      }
      model.updated(flags, active2.layer, active2.dataset);
      // signal the map to update even if an error has occured, because the
      // commands may have partially succeeded and changes may have occured to
      // the data.
      if (err) onError(err);
    });
  }

  function onError(err) {
    if (utils.isString(err)) {
      stop(err);
    } else if (err.name == 'APIError') {
      // stop() has already been called, don't need to log
    } else if (err.name) {
      // log stack trace to browser console
      console.error(err.stack);
      // log to console window
      warning(err.message);
    }
  }

  function consoleStop() {
    var msg = gui.formatMessageArgs(arguments);
    warning(msg);
    throw new APIError(msg);
  }

  function warning() {
    var msg = gui.formatMessageArgs(arguments);
    toLog(msg, 'console-error');
  }

  function consoleMessage() {
    var msg = gui.formatMessageArgs(arguments);
    if (internal.LOGGING && !internal.QUIET) {
      toLog(msg, 'console-message');
    }
  }

  function consoleError() {
    var msg = gui.formatMessageArgs(arguments);
    throw new Error(msg);
  }

  function printExample(comment, command) {
    toLog(comment, 'console-message');
    toLog(command, 'console-example');
  }

  function printExamples() {
    printExample("See a list of all console commands", "$ help");
    printExample("Get help using a single command", "$ help innerlines");
    printExample("Get information about the active data layer", "$ info");
    printExample("Delete one state from a national dataset","$ filter 'STATE != \"Alaska\"'");
    printExample("Aggregate counties to states by dissolving shared edges" ,"$ dissolve 'STATE'");
    printExample("Clear the console", "$ clear");
  }
}




function Model() {
  var self = new api.internal.Catalog();
  utils.extend(self, EventDispatcher.prototype);

  self.updated = function(flags, lyr, dataset) {
    var targ, active;
    // if (lyr && dataset && (!active || active.layer != lyr)) {
    if (lyr && dataset) {
      self.setDefaultTarget([lyr], dataset);
    }
    targ = self.getDefaultTarget();
    if (lyr && targ.layers[0] != lyr) {
      flags.select = true;
    }
    active = {layer: targ.layers[0], dataset: targ.dataset};
    if (flags.select) {
      self.dispatchEvent('select', active);
    }
    self.dispatchEvent('update', utils.extend({flags: flags}, active));
  };

  self.selectLayer = function(lyr, dataset) {
    self.updated({select: true}, lyr, dataset);
  };

  self.selectNextLayer = function() {
    var next = self.findNextLayer(self.getActiveLayer().layer);
    if (next) self.selectLayer(next.layer, next.dataset);
  };

  self.selectPrevLayer = function() {
    var prev = self.findPrevLayer(self.getActiveLayer().layer);
    if (prev) self.selectLayer(prev.layer, prev.dataset);
  };

  return self;
}




Browser.onload(function() {
  if (!gui.browserIsSupported()) {
    El("#mshp-not-supported").show();
    return;
  }
  gui.startEditing();
  if (window.location.hostname == 'localhost') {
    window.addEventListener('beforeunload', function() {
      // send termination signal for mapshaper-gui
      var req = new XMLHttpRequest();
      req.open('GET', '/close');
      req.send();
    });
  }
});

gui.getImportOpts = function() {
  var vars = gui.getUrlVars();
  var urlFiles = vars.files ? vars.files.split(',') : [];
  var manifestFiles = mapshaper.manifest || [];
  return {
    files: urlFiles.concat(manifestFiles)
  };
};

gui.startEditing = function() {
  var model = new Model(),
      dataLoaded = false,
      map, repair, simplify;
  gui.startEditing = function() {};
  map = new MshpMap(model);
  repair = new RepairControl(model, map);
  simplify = new SimplifyControl(model);
  new AlertControl();
  new ImportFileProxy(model);
  new ImportControl(model, gui.getImportOpts());
  new ExportControl(model);
  new LayerControl(model, map);

  model.on('select', function() {
    if (!dataLoaded) {
      dataLoaded = true;
      El('#mode-buttons').show();
      El('#nav-buttons').show();
      new Console(model);
    }
  });
  // TODO: untangle dependencies between SimplifyControl, RepairControl and Map
  simplify.on('simplify-start', function() {
    repair.hide();
  });
  simplify.on('simplify-end', function() {
    repair.update();
  });
  simplify.on('change', function(e) {
    map.setSimplifyPct(e.value);
  });
};

}());
