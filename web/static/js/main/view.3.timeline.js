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
    "enemy"         : ["#404040", "#fff"]
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
        this.canvasElement = null;
        this.canvasContext = null;
        this.needRedraw = true;
        this.seek = null;
        this.tickTimeout = null;
        this.images = {};
        this.buildBaseElements();
        this.onResize();
        this.tick();
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
        this.needRedraw = true;
    }

    onEncounter(encounter)
    {
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
        this.drawCombatants();
    }

    drawCombatants()
    {
        // get combatant list
        var combatants = this.combatantCollector.getSortedCombatants("role");
        // enemy combatant
        combatants.unshift(new Combatant());
        console.log(combatants);
        combatants[0].data = {
            "Job"       : "enemy",
            "Name"      : "Enemy Combatant(s)"
        }

        // set draw styles
        this.canvasContext.fillStyle = "#fff";
        this.canvasContext.font = TIMELINE_COMBATANT_NAME_SIZE + "px sans-serif";
        this.canvasContext.textAlign = "left";
        for (var i = 0; i < combatants.length; i++) {
            var combatant = combatants[i];
            // draw role bg color
            this.canvasContext.fillStyle = TIMELINE_ROLE_COLORS[combatant.getRole()][0];
            this.canvasContext.fillRect(
                0, TIMELINE_KEY_HEIGHT + (i * TIMELINE_COMBATANT_HEIGHT), TIMELINE_COMBATANT_WIDTH, TIMELINE_COMBATANT_HEIGHT
            );
            // draw role icon
            var jobIconSrc = "/static/img/job/" + combatant.data.Job.toLowerCase() + ".png";
            if (combatant.data.Job == "enemy") {
                var jobIconSrc = "/static/img/enemy.png";
            }
            this.drawImage(
                jobIconSrc,
                16,
                TIMELINE_KEY_HEIGHT + ((i + 1) * TIMELINE_COMBATANT_HEIGHT) - ((TIMELINE_COMBATANT_HEIGHT + TIMELINE_COMBATANT_JOB_ICON_SIZE) / 2),
                TIMELINE_COMBATANT_JOB_ICON_SIZE,
                TIMELINE_COMBATANT_JOB_ICON_SIZE
            );
            // draw role name
            this.canvasContext.fillStyle = TIMELINE_ROLE_COLORS[combatant.getRole()][1];
            this.canvasContext.fillText(
                combatant.getDisplayName(),
                TIMELINE_COMBATANT_JOB_ICON_SIZE + 24,
                TIMELINE_KEY_HEIGHT + ((i + 1) * TIMELINE_COMBATANT_HEIGHT) - ((TIMELINE_COMBATANT_HEIGHT + TIMELINE_COMBATANT_NAME_SIZE) / 2) + TIMELINE_COMBATANT_NAME_SIZE
            );

            // draw seperator line
            this.canvasContext.fillStyle = "#fff";
            this.canvasContext.fillRect(
                0, TIMELINE_KEY_HEIGHT + (i * TIMELINE_COMBATANT_HEIGHT - 1), this.getViewWidth(), 1
            );
            this.canvasContext.fillRect(
                0, TIMELINE_KEY_HEIGHT + ((i + 1) * TIMELINE_COMBATANT_HEIGHT - 1), this.getViewWidth(), 1
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

}