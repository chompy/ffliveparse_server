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

var TIMELINE_PIXELS_PER_MILLISECOND = 0.07; // how many pixels represents a millisecond in timeline
var TIMELINE_PIXEL_OFFSET = TIMELINE_PIXELS_PER_MILLISECOND * 1000;
var GAIN_EFFECT_REGEX = /1A\:([a-zA-Z0-9` ']*) gains the effect of ([a-zA-Z0-9` ']*) from ([a-zA-Z0-9` ']*) for ([0-9]*)\.00 Seconds\./;
var LOSE_EFFECT_REGEX = /1E\:([a-zA-Z0-9` ']*) loses the effect of ([a-zA-Z0-9` ']*) from ([a-zA-Z0-9` ']*)\./;
var TIMELINE_KEY_HEIGHT = 24;
var TIMELINE_COMBATANT_HEIGHT =  64;
var TIMELINE_COMBATANT_WIDTH = 256;
var TIMELINE_COMBATANT_JOB_ICON_SIZE = 48;
var TIMELINE_COMBATANT_NAME_SIZE = 16;
var TIMELINE_ROLE_COLORS = {
    "healer"        : ["#2fa35f", "#000"],
    "tank"          : ["#4f59c4", "#fff"],
    "dps"           : ["#723c3a", "#fff"],
    "enemy"         : ["#404040", "#fff"],
    "pet"           : ["#404040", "#fff"]
};
var TIMELINE_ACTION_ICON_SIZES = {
    [ACTION_TYPE_NORMAL]: [40, 40],
    [ACTION_TYPE_GAIN_STATUS_EFFECT]: [24, 32],
    [ACTION_TYPE_LOSE_STATUS_EFFECT]: [24, 32],
    [ACTION_TYPE_DEATH]: [40, 40]
};

class ViewTimeline extends ViewBase
{

    getName()
    {
        return "timeline";
    }

    getTitle()
    {
        return "Timeline"
    }

    init()
    {
        super.init();
        this.encounter = null;
        this.canvasElement = null;
        this.canvasContext = null;
        this.needRedraw = true;
        this.seek = null;
        this.vOffset = 0;
        this.tickTimeout = null;
        this.images = {};
        this.combatants =[];
        this.buildBaseElements();
        this.onResize();
        this.tick();
        
        var t = this;
        // horizontal scrolling
        function hScrollTimeline(e) {
            var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
            t.addSeek(delta * 800);
        }
        this.canvasElement.addEventListener("mousewheel", hScrollTimeline);
        this.canvasElement.addEventListener("DOMMouseScroll", hScrollTimeline);
        // drag scroll timeline
        this.mouseIsDown = false;
        this.mouseHasDrag = false;
        
        this.canvasElement.addEventListener("mousedown", function(e) {
            t.mouseIsDown = true;
        });
        this.canvasElement.addEventListener("touchstart", function(e) {
            t.mouseIsDown = true;
        });
        window.addEventListener("mouseup", function(e) {
            t.mouseIsDown = false;
        });
        window.addEventListener("touchend", function(e) {
            t.mouseIsDown = false;
        });
        var scrollTimeline = function(movement) {
            if (!t.mouseIsDown) {
                return;
            }
            if (Math.abs(movement[0]) > 1 || Math.abs(movement[1]) > 1) {
                t.mouseHasDrag = true;
            }
            t.addSeek(movement[0] * 15);
            // vertical scroll
            /*var combatantOffset = parseInt(t.combatantContainerElement.style.marginTop);
            if (!combatantOffset) {
                combatantOffset = 0;
            }
            combatantOffset = combatantOffset + (movement[1] * 2);
            if (combatantOffset > 0) {
                combatantOffset = 0;
            } else if (combatantOffset < -(t.combatantContainerElement.offsetHeight - (window.innerHeight - t.timelineVOffset))) {
                combatantOffset = -(t.combatantContainerElement.offsetHeight - (window.innerHeight - t.timelineVOffset));
            }
            
            t.combatantContainerElement.style.marginTop = combatantOffset + "px";
            t.timelineElement.style.marginTop = combatantOffset + "px";*/
        };
        this.canvasElement.addEventListener("mousemove", function(e) {
            scrollTimeline([e.movementX, e.movementY]);
        });
        this.lastTouchPos = null;
        this.canvasElement.addEventListener("touchmove", function(e) {
            if (!t.lastTouchPos) {
                t.lastTouchPos = [e.touches[0].clientX, e.touches[0].clientY];
                return;
            }
            scrollTimeline([e.touches[0].clientX - t.lastTouchPos[0], e.touches[0].clientY - t.lastTouchPos[1]]);
            t.lastTouchPos = null;
        });


    }

    buildBaseElements()
    {
        var element = this.getElement();
        this.canvasElement = document.createElement("canvas");
        this.canvasContext = this.canvasElement.getContext("2d");
        element.appendChild(this.canvasElement);
    }

    onResize()
    {
        if (this.canvasElement) {
            this.canvasElement.width = this.getViewWidth();
            this.canvasElement.height = this.getViewHeight();
            this.redraw();
        }
    }

    onCombatant(combatant)
    {
        this.combatants = [];
        this.needRedraw = true;
    }

    onEncounter(encounter)
    {
        this.encounter = encounter;
        this.needRedraw = true;
    }
    
    onLogLine(logLine)
    {
        this.needRedraw = true;
    }

    onActive()
    {
        super.onActive();
        this.tick();
        this.redraw();
    }
    
    tick()
    {
        if (this.tickTimeout) {
            clearTimeout(this.tickTimeout);
        }
        if (!this.active) {
            return;
        }
        if (this.needRedraw) {
            this.redraw();
            this.needRedraw = false;
        }
        var t = this;
        this.tickTimeout = setTimeout(
            function() { t.tick(); },
            1000
        );
    }

    redraw()
    {
        this.canvasContext.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        this.drawCombatants();
        this.drawTimeKeys();
        this.drawActions();
    }

    drawCombatants()
    {
        // get combatant list
        var combatants = this.getCombatantList();
        // set draw styles
        this.canvasContext.fillStyle = "#fff";
        this.canvasContext.font = TIMELINE_COMBATANT_NAME_SIZE + "px sans-serif";
        this.canvasContext.textAlign = "left";
        var combatantCount = -1;
        for (var i = 0; i < combatants.length; i++) {
            var combatant = combatants[i];
            if (combatant.isEnemy() || !combatant.data.Job) {
                continue;
            }
            combatantCount++;
            // draw role bg color
            this.canvasContext.fillStyle = TIMELINE_ROLE_COLORS[combatant.getRole()][0];
            this.canvasContext.fillRect(
                0, TIMELINE_KEY_HEIGHT + (combatantCount * TIMELINE_COMBATANT_HEIGHT), TIMELINE_COMBATANT_WIDTH, TIMELINE_COMBATANT_HEIGHT
            );
            // draw role icon
            var jobIconSrc = "/static/img/job/" + combatant.data.Job.toLowerCase() + ".png";
            if (combatant.data.Job == "enemy") {
                var jobIconSrc = "/static/img/enemy.png";
            }
            this.drawImage(
                jobIconSrc,
                16,
                TIMELINE_KEY_HEIGHT + ((combatantCount + 1) * TIMELINE_COMBATANT_HEIGHT) - ((TIMELINE_COMBATANT_HEIGHT + TIMELINE_COMBATANT_JOB_ICON_SIZE) / 2),
                TIMELINE_COMBATANT_JOB_ICON_SIZE,
                TIMELINE_COMBATANT_JOB_ICON_SIZE
            );
            // draw role name
            this.canvasContext.fillStyle = TIMELINE_ROLE_COLORS[combatant.getRole()][1];
            this.canvasContext.fillText(
                combatant.getDisplayName(),
                TIMELINE_COMBATANT_JOB_ICON_SIZE + 24,
                TIMELINE_KEY_HEIGHT + ((combatantCount + 1) * TIMELINE_COMBATANT_HEIGHT) - ((TIMELINE_COMBATANT_HEIGHT + TIMELINE_COMBATANT_NAME_SIZE) / 2) + TIMELINE_COMBATANT_NAME_SIZE
            );

            // draw seperator line
            this.canvasContext.fillStyle = "#fff";
            this.canvasContext.fillRect(
                0, TIMELINE_KEY_HEIGHT + (combatantCount * TIMELINE_COMBATANT_HEIGHT - 1), this.getViewWidth(), 1
            );
            this.canvasContext.fillRect(
                0, TIMELINE_KEY_HEIGHT + ((combatantCount + 1) * TIMELINE_COMBATANT_HEIGHT - 1), this.getViewWidth(), 1
            );
        }
        // draw vertical seperator
        this.canvasContext.fillRect(
            TIMELINE_COMBATANT_WIDTH, 0, 1, this.getViewHeight()
        );
    }
    
    /**
     * Draw timestamps.
     */
    drawTimeKeys()
    {
        if (!this.encounter) {
            return;
        }
        // get time to draw from
        var drawTime = this.encounter.getEndTime();
        if (this.seek) {
            drawTime = this.seek;
        }
        // draw background
        this.canvasContext.fillStyle = "#404040";
        this.canvasContext.fillRect(
            0, 0, this.getViewWidth(), TIMELINE_KEY_HEIGHT
        );
        // draw line
        this.canvasContext.fillStyle = "#fff";
        this.canvasContext.fillRect(
            0, TIMELINE_KEY_HEIGHT - 1, this.getViewWidth(), 1
        );
        // draw times
        this.canvasContext.font = "14px sans-serif";
        this.canvasContext.textAlign = "center";
        var duration = drawTime.getTime() - this.encounter.data.StartTime.getTime();
        var offset = (duration % 1000) * TIMELINE_PIXELS_PER_MILLISECOND;
        for (var i = 0; i < 99; i++) {
            // draw text
            var seconds = parseInt(duration / 1000) - i;
            if (seconds < 0) {
                break;
            }
            var timeKeyText = ((seconds / 60) < 10 ? "0" : "") + (Math.floor((seconds / 60)).toFixed(0)) + ":" + ((seconds % 60) < 10 ? "0" : "") + (seconds % 60);
            var position = parseInt((i * 1000) * TIMELINE_PIXELS_PER_MILLISECOND) + offset;
            if (position > this.getViewWidth() - TIMELINE_COMBATANT_WIDTH) {
                break;
            }
            this.canvasContext.fillText(
                timeKeyText,
                position + TIMELINE_COMBATANT_WIDTH,
                TIMELINE_KEY_HEIGHT - 8
            );
            // draw vertical grid line
            this.canvasContext.fillRect(position + TIMELINE_COMBATANT_WIDTH, 25, 1, this.getViewHeight());
        }
    }

    /**
     * Draw actions in current timeline viewport.
     */
    drawActions()
    {
        if (!this.encounter || !this.actionData) {
            return;
        }
        // get end time to draw from
        var drawEndTime = this.encounter.getEndTime();
        if (this.seek) {
            drawEndTime = this.seek;
        }    
        // get start time to draw from
        var drawDuration = Math.ceil((this.getViewWidth() - TIMELINE_COMBATANT_WIDTH) / TIMELINE_PIXELS_PER_MILLISECOND);
        var drawStartTime = new Date(drawEndTime.getTime() - drawDuration);
        // get actions in time frame
        var actions = this.actionCollector.findInDateRange(
            drawStartTime,
            drawEndTime
        );
        // itterate and draw actions
        for (var i in actions) {
            var action = actions[i];
            var actionDrawData = this.getActionDrawData(action);
            if (!actionDrawData || !action || !action.type) {
                continue;
            }
            // calculate position/size
            var w = TIMELINE_ACTION_ICON_SIZES[action.type][0];
            var h = TIMELINE_ACTION_ICON_SIZES[action.type][1];
            var x = TIMELINE_COMBATANT_WIDTH + parseInt((drawEndTime.getTime() - action.time.getTime()) * TIMELINE_PIXELS_PER_MILLISECOND);
            var y = TIMELINE_KEY_HEIGHT + (actionDrawData.vindex * TIMELINE_COMBATANT_HEIGHT) + ((TIMELINE_COMBATANT_HEIGHT - h) / 2);

            this.drawImage(
                actionDrawData.icon,
                x,
                y,
                w,
                h
            );


        }

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
     * Get list of combatants.
     * @return {array}
     */
    getCombatantList()
    {
        if (this.combatants && this.combatants.length > 0) {
            return this.combatants;
        }
        this.combatants = [];
        // enemy combatant
        this.combatants.push(new Combatant());
        this.combatants[0].data = {
            "Job"       : "enemy",
            "Name"      : "Enemy Combatant(s)"
        }
        // get combatant list
        var fetchedCombatants = this.combatantCollector.getSortedCombatants("role");
        for (var i in fetchedCombatants) {
            if (!fetchedCombatants[i].isEnemy() && fetchedCombatants[i].data.Job) {
                this.combatants.push(fetchedCombatants[i]);
            }
        }
        return this.combatants;
    }

    /**
     * Get data needed to draw action.
     * @param {Action} action 
     * @return {object}
     */
    getActionDrawData(action)
    {
        // find combatant
        var combatants = this.getCombatantList();
        var combatant = null;
        switch (action.type) {
            case ACTION_TYPE_GAIN_STATUS_EFFECT:
            case ACTION_TYPE_LOSE_STATUS_EFFECT:
            {
                combatant = action.targetCombatant;
                break;
            }
            default:
            {
                combatant = action.sourceCombatant;
                break;
            }
        }
        if (combatants.indexOf(combatant) == -1) {
            combatant = combatants[0];
        }
        // get vertical index
        var vIndex = combatants.indexOf(combatant);
        if (vIndex == -1) {
            return null;
        }
        // get action data
        var actionData = null;
        switch (action.type) {
            case ACTION_TYPE_NORMAL:
            {
                actionData = this.actionData.getActionById(action.data.actionId);
                break;
            }
            case ACTION_TYPE_GAIN_STATUS_EFFECT:
            case ACTION_TYPE_LOSE_STATUS_EFFECT:
            {
                actionData = this.statusData.getStatusByName(action.data.actionName);
                break;
            }
        }
        // get icon image
        var actionImageSrc = "";
        if (!actionData && action.type == ACTION_TYPE_DEATH) {
            actionImageSrc = "/static/img/death.png";
        } else if (combatant.isEnemy()) {
            actionImageSrc = "/static/img/enemy.png";
        } else if (actionData && actionData.icon) {
            actionImageSrc = ACTION_DATA_BASE_URL + actionData.icon;
            if ([ACTION_TYPE_GAIN_STATUS_EFFECT, ACTION_TYPE_LOSE_STATUS_EFFECT].indexOf(action.type) != -1) {
                actionImageSrc = STATUS_DATA_BASE_URL + actionData.icon;
            }
        }
        return {
            "combatant"         : combatant,
            "data"              : actionData,
            "icon"              : actionImageSrc,
            "vindex"            : vIndex
        };
    }

    addSeek(offset)
    {
        var currentSeekTime = this.encounter.getEndTime();
        if (this.seek) {
            currentSeekTime = this.seek;
        }
        this.seek = new Date(currentSeekTime.getTime() + offset);
        this.redraw();
    }

}