/*
This file is part of FFLiveParse.

FFLiveParse is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

FFLiveParse is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with FFLiveParse.  If not, see <https://www.gnu.org/licenses/>.
*/

var GRID_PIXELS_PER_MILLISECOND = .125; // how many pixels represents a millisecond in timeline
var GRID_PIXEL_OFFSET = GRID_PIXELS_PER_MILLISECOND * 1000;
// define sizes of different elements at different break points
var GRID_BREAKPOINT_FULL = 99999;
var GRID_BREAKPOINT_MOBILE = 768;
var GRID_ELEMENT_SIZES = {
    "key_height" : {
        [GRID_BREAKPOINT_FULL] : 24
    },
    "key_width": {
        [GRID_BREAKPOINT_FULL] : 64
    },
};

class ViewGridBase extends ViewBase
{

    /** {@inheritdoc} */
    init()
    {
        super.init();
        this.reset();
        this.buildBaseElements();
        this.onResize();
        this.enableScroll();
        this.tick();
    }

    /**
     * Reset view state.
     */
    reset()
    {
        this.elementSizes = {};
        this.max = 0;
        this.seek = 0;
        this.images = {};
        this.needRedraw = true;
        this.tickTimeout = null;
        this.leftOffset = 0;
        this.addElementSizes(GRID_ELEMENT_SIZES);
    }

    /**
     * Tick.
     */
    tick()
    {
        if (this.tickTimeout) {
            clearTimeout(this.tickTimeout);
        }
        if (!this.active) {
            return;
        }
        if (this.needRedraw || (this.encounter && this.encounter.data.Active)) {
            this.redraw();
            this.needRedraw = false;
        }
        var t = this;
        this.tickTimeout = setTimeout(
            function() { t.tick(); },
            250
        );
    }

    /**
     * Build canvas base elements.
     */
    buildBaseElements()
    {
        var element = this.getElement();
        this.scrollElement = document.createElement("div");
        this.canvasElement = document.createElement("canvas");
        this.canvasContext = this.canvasElement.getContext("2d");
        this.scrollElement.appendChild(this.canvasElement)
        element.appendChild(this.scrollElement);
    }

    /** {@inheritdoc} */
    onResize()
    {
        if (this.canvasElement) {
            this.canvasElement.width = this.getViewWidth();
            this.canvasElement.height = this.getViewHeight();
            this.redraw();
        }
    }
    
    /** {@inheritdoc} */
    onActive()
    {
        super.onActive();
        this.redraw();
        this.tick();
    }
    
    /**
     * Redraw canvas.
     */
    redraw()
    {
        this.canvasContext.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        this.scrollElement.style.width = this.max + "px";
        this.scrollElement.style.height = this.getViewHeight() + "px";
    }

    /**
     * Enable the scrolling of grid with mouse.
     */
    enableScroll()
    {
        var t = this;
        var ticking = false;
        // horizontal scrolling
        function hScrollTimeline(e) {
            var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
            t.addSeek(delta * 800);
        }
        this.canvasElement.addEventListener("mousewheel", hScrollTimeline);
        this.canvasElement.addEventListener("DOMMouseScroll", hScrollTimeline);
        // drag scroll timeline
        this.mouseIsDown = false;
        this.mouseIsDrag = false;
        this.canvasElement.addEventListener("mousedown", function(e) {
            t.mouseIsDown = true;
        });
        this.canvasElement.addEventListener("touchstart", function(e) {
            t.mouseIsDown = true;
        });
        window.addEventListener("mouseup", function(e) {
            t.mouseIsDown = false;
            t.mouseIsDrag = false;
            t.lastTouchPos = null;
        });
        window.addEventListener("touchend", function(e) {
            t.mouseIsDown = false;
            t.mouseIsDrag = false;
            t.lastTouchPos = null;
        });
        this.canvasElement.addEventListener("mousemove", function(e) {
            t._scrollGrid([e.movementX, e.movementY]);
        });
        this.lastTouchPos = null;
        this.canvasElement.addEventListener("touchmove", function(e) {
            if (!t.lastTouchPos) {
                t.lastTouchPos = [e.touches[0].clientX, e.touches[0].clientY];
                return;
            }
            t._scrollGrid([e.touches[0].clientX - t.lastTouchPos[0], e.touches[0].clientY - t.lastTouchPos[1]]);
            t.lastTouchPos = null;
        });        
        this.getElement().addEventListener("scroll", function(e) {
            if (!ticking) {
                var element = t.getElement();
                window.requestAnimationFrame(function() {
                    t.seek = t.scrollElement.offsetWidth - element.scrollLeft;
                    t.redraw();
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    /**
     * Add element size at given break point.
     * @param {string} key 
     * @param {integer} breakpoint 
     * @param {mixed} value 
     */
    addElementSize(key, breakpoint, value)
    {
        if (typeof(this.elementSizes[key]) == "undefined") {
            this.elementSizes[key] = {};
        }
        this.elementSizes[key][breakpoint] = value;
    }

    /**
     * Add element sizes from dictionary.
     * @param {object} values 
     */
    addElementSizes(values)
    {
        for (var key in values) {
            for (var breakpoint in values[key]) {
                this.addElementSize(
                    key, breakpoint, values[key][breakpoint]
                );
            }
        }
    }

    /**
     * Fetch an element size for a given key.
     * @param {string} key 
     * @return {integer}
     */
    getElementSize(key)
    {
        if (key in this.elementSizes) {
            var currentCanvasWidth = this.getViewWidth();
            var elementSizes = this.elementSizes[key];
            var bestBreakpoint = null;
            for (var breakpoint in elementSizes) {
                if (
                    currentCanvasWidth <= breakpoint && 
                    (!bestBreakpoint || breakpoint < bestBreakpoint)
                ) {
                    bestBreakpoint = breakpoint;
                }
            }
            if (bestBreakpoint) {
                return elementSizes[bestBreakpoint];
            }
        }
        // key not found
        return 0;
    }

    /**
     * Short hand for getElementSize
     * @param {string} key 
     * @return {integer}
     */
    _ES(key)
    {
        return this.getElementSize(key)
    }

    /**
     * Get cursor position relative to canvas.
     * @param {Event} event 
     * @see https://stackoverflow.com/a/18053642
     */
    _getCursorPosition(event) {
        var rect = this.canvasElement.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;
        return [parseInt(x), parseInt(y)];
    }

    /**
     * Add value to current seek position.
     * @param {integer} offset 
     */
    addSeek(offset)
    {
        if (!this.max) {
            return;
        }
        var currentSeek = this.max;
        if (this.seek) {
            currentSeek = this.seek;
        }
        currentSeek += offset;
        if (currentSeek > this.max) {
            currentSeek = null;
        } else if (currentSeek < 0) {
            currentSeek = 1;
        }
        this.seek = currentSeek;
        if (currentSeek) {
            this.getElement().scrollLeft = this.max - currentSeek;
        }
        this.redraw();
    }    

    /**
     * Utility function, draw timestamps in canvas.
     */
    drawTimeKeys(encounter)
    {
        if (!encounter) {
            return;
        }
        // get time to draw from
        var drawTime = encounter.getEndTime();
        if (this.seek) {
            drawTime = new Date(this.seek + encounter.data.StartTime.getTime());
        }
        // draw background
        this.canvasContext.fillStyle = "#404040";
        this.canvasContext.fillRect(
            0, 0, this.getViewWidth(), this._ES("key_height")
        );
        // draw line
        this.canvasContext.fillStyle = "#fff";
        this.canvasContext.fillRect(
            0, this._ES("key_height") - 1, this.getViewWidth(), 1
        );
        // draw times
        this.canvasContext.font = "14px sans-serif";
        this.canvasContext.textAlign = "center";
        this.canvasContext.textBaseline = "middle";
        var duration = drawTime.getTime() - encounter.data.StartTime.getTime();
        var offset = (duration % 1000) * GRID_PIXELS_PER_MILLISECOND;
        for (var i = 0; i < 99; i++) {
            // draw text
            var seconds = parseInt(duration / 1000) - i;
            if (seconds < 0) {
                break;
            }
            var timeKeyText = ((seconds / 60) < 10 ? "0" : "") + (Math.floor((seconds / 60)).toFixed(0)) + ":" + ((seconds % 60) < 10 ? "0" : "") + (seconds % 60);
            var position = parseInt((i * 1000) * GRID_PIXELS_PER_MILLISECOND) + offset;
            if (position > this.getViewWidth() - this._ES("key_width")) {
                break;
            }
            this.canvasContext.fillText(
                timeKeyText,
                position + this._ES("key_width"),
                this._ES("key_height") / 2
            );
            // draw vertical grid line
            this.canvasContext.fillRect(position + this._ES("key_width"), 25, 1, this.getViewHeight());
        }
        this.canvasContext.fillRect(this._ES("key_width"), 25, 1, this.getViewHeight());
    }

    /**
     * Scroll the grid based on mouse movement.
     * @param {object} movement 
     */
    _scrollGrid(movement)
    {
        if (!this.mouseIsDown) {
            return;
        }
        this.mouseIsDrag = true;
        this.addSeek(movement[0] * 15);
    }

    /**
     * Draw image to canvas.
     * @param {string} src 
     * @param {integer} x 
     * @param {integer} y 
     * @param {integer} w
     * @param {integer} h
     */
    drawImage(src, x, y, w, h)
    {
        // not yet loaded
        if (typeof(this.images[src]) == "undefined") {
            var image = new Image();
            this.images[src] = image;
            image.src = src;
            image._loaded = false;
            var t = this;
            image.onload = function() {
                image._loaded = true;
                t.needRedraw = true;
            };
            this.canvasContext.fillStyle = "#e7e7e7";
            this.canvasContext.fillRect(x, y, w, h);

            return;
        }
        // loaded, draw
        this.canvasContext.drawImage(
            this.images[src],
            x, y, w, h
        );
    }

    /**
     * Draw text to display for mouse over.
     * @param {*} text 
     * @param {*} x 
     * @param {*} y 
     */
    drawMouseOverText(text, x, y)
    {
        this.canvasContext.font = "14px sans-serif";
        this.canvasContext.textAlign = "left";
        this.canvasContext.textBaseline = "top";
        var textMeasure = this.canvasContext.measureText(text);
        this.canvasContext.fillStyle = "#000000";
        this.canvasContext.fillRect(x, y, textMeasure.width + 16, 26);
        this.canvasContext.fillStyle = "#ffffff";
        this.canvasContext.fillText(text, x + 8, y + 8);
    }

}