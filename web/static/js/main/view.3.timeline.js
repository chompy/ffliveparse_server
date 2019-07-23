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

var GAIN_EFFECT_REGEX = /1A\:([a-zA-Z0-9` ']*) gains the effect of ([a-zA-Z0-9` ']*) from ([a-zA-Z0-9` ']*) for ([0-9]*)\.00 Seconds\./;
var LOSE_EFFECT_REGEX = /1E\:([a-zA-Z0-9` ']*) loses the effect of ([a-zA-Z0-9` ']*) from ([a-zA-Z0-9` ']*)\./;
// define sizes of different elements at different break points
var TIMELINE_ELEMENT_SIZES = {
    "key_height" : {
        [GRID_BREAKPOINT_FULL] : 24
    },
    "combatant_height" : {
        [GRID_BREAKPOINT_FULL] : 64
    },
    "combatant_width" : {
        [GRID_BREAKPOINT_FULL] : 256,
        [GRID_BREAKPOINT_MOBILE] : 64,
    },
    "key_width" : {
        [GRID_BREAKPOINT_FULL] : 256,
        [GRID_BREAKPOINT_MOBILE] : 64,
    },
    "job_icon_width" : {
        [GRID_BREAKPOINT_FULL] : 48
    },
    "job_icon_height" : {
        [GRID_BREAKPOINT_FULL] : 48
    },
    "job_icon_width_small" : {
        [GRID_BREAKPOINT_FULL] : 24
    },
    "job_icon_height_small" : {
        [GRID_BREAKPOINT_FULL] : 24
    },
    "combatant_name_font" : {
        [GRID_BREAKPOINT_FULL] : 16
    },
    "action_icon_normal_width" : {
        [GRID_BREAKPOINT_FULL] : 40
    },
    "action_icon_normal_height" : {
        [GRID_BREAKPOINT_FULL] : 40
    },
    "action_icon_status_width" : {
        [GRID_BREAKPOINT_FULL] : 24
    },
    "action_icon_status_height" : {
        [GRID_BREAKPOINT_FULL] : 32
    }
}
var TIMELINE_ROLE_COLORS = {
    "healer"        : ["#2fa35f", "#000"],
    "tank"          : ["#4f59c4", "#fff"],
    "dps"           : ["#723c3a", "#fff"],
    "enemy"         : ["#404040", "#fff"],
    "pet"           : ["#404040", "#fff"]
};
var TIMELINE_ACTION_ICON_SIZE_KEYS = {
    [ACTION_TYPE_NORMAL]: ["action_icon_normal_width", "action_icon_normal_height"],
    [ACTION_TYPE_GAIN_STATUS_EFFECT]: ["action_icon_status_width", "action_icon_status_height"],
    [ACTION_TYPE_LOSE_STATUS_EFFECT]: ["action_icon_status_width", "action_icon_status_height"],
    [ACTION_TYPE_DEATH]: ["action_icon_normal_width", "action_icon_normal_width"]
};

class ViewTimeline extends ViewGridBase
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
        var t = this;
        var mouseOverAction = function(e) {
            var mousePos = t._getCursorPosition(e);
            for (var i = t.actionPositions.length - 1; i >= 0; i--) {
                var actionPosData = t.actionPositions[i];
                if (
                    mousePos[0] > actionPosData[1] && mousePos[1] > actionPosData[2] &&
                    mousePos[0] < actionPosData[1] + actionPosData[3] &&
                    mousePos[1] < actionPosData[2] + actionPosData[4]
                ) {
                    return actionPosData[0];
                }
            }
            return null;
        }
        var displayOverlay = function(e) {
            // remove overlay
            if (t.overlayAction) {
                t.overlayAction = null;
                t.redraw();
                return;
            }
            // don't display overlay if mouse is dragging
            if (t.mouseIsDrag) {
                return;
            }
            // show overlay
            var mousePos = t._getCursorPosition(e);
            var action = mouseOverAction(e);
            if (action) {
                t.overlayAction = action;
                t.redraw();
            }
        }
        window.addEventListener("mouseup", function(e) {
            displayOverlay(e);
        });
        window.addEventListener("touchend", function(e) {
            displayOverlay(e);

        });
        var scrollTimeline = function(movement) {
            if (!t.mouseIsDown) {
                return;
            }
            t.overlayAction = null;
            t.mouseIsDrag = true;
            t.addSeek(movement[0] * 15);
            t.vOffset -= movement[1];
            if (t.vOffset < 0) {
                t.vOffset = 0;
                return;
            }
            var combatants = t.getCombatantList();
            var maxVScroll = (combatants.length * t._ES("combatant_height")) - t.getViewHeight();
            if (t.vOffset > maxVScroll) {
                t.vOffset = maxVScroll;
                if (t.vOffset < 0) {
                    t.vOffset = 0;
                }
            }
        };
        this.canvasElement.addEventListener("mousemove", function(e) {
            t.mousePos = [e.x, e.y];
            if (t.mouseIsDrag) {
                t.canvasElement.classList.remove("action-over");
                return;
            }
            // show mouse pointer if hovering over action
            if (mouseOverAction(e)) {
                t.canvasElement.classList.add("action-over");
            } else {
                t.canvasElement.classList.remove("action-over");
            }
        });
    }

    reset()
    {
        super.reset();
        this.encounter = null;
        this.seek = null;
        this.vOffset = 0;
        this.images = {};
        this.combatants =[];
        this.actionPositions = [];
        this.overlayAction = null;
        this.addElementSizes(TIMELINE_ELEMENT_SIZES);
    }

    onCombatant(combatant)
    {
        this.combatants = [];
        this.needRedraw = true;
        this.max = this.encounter.getLength();
    }

    onEncounter(encounter)
    {
        this.reset();
        this.encounter = encounter;
        this.max = this.encounter.getLength();
        this.redraw();
    }
    
    onLogLine(logLine)
    {
        this.needRedraw = true;
    }
    
    tick()
    {
        if (!this.active) {
            return;
        }
        if (this.encounter) {
            this.max = this.encounter.getLength();
        }
        super.tick();
    }

    redraw()
    {
        super.redraw();
        this.drawCombatants();
        this.drawActions();
        this.drawTimeKeys();
        this.drawOverlay();
    }

    drawCombatants()
    {
        // get combatant list
        var combatants = this.getCombatantList();
        // set draw styles
        this.canvasContext.fillStyle = "#fff";
        this.canvasContext.font = this._ES("combatant_name_font") + "px sans-serif";
        this.canvasContext.textAlign = "left";
        var combatantCount = -1;
        for (var i = 0; i < combatants.length; i++) {
            var combatant = combatants[i];
            if (combatant.isEnemy() || !combatant.getLastSnapshot().Job) {
                continue;
            }
            combatantCount++;
            // draw role bg color
            this.canvasContext.fillStyle = TIMELINE_ROLE_COLORS[combatant.getRole()][0];
            this.canvasContext.fillRect(
                0,
                this._ES("key_height") + (combatantCount * this._ES("combatant_height")) - this.vOffset,
                this._ES("combatant_width"),
                this._ES("combatant_height")
            );
            // draw role icon
            var jobIconSrc = "/static/img/job/" + combatant.getLastSnapshot().Job.toLowerCase() + ".png";
            if (combatant.getLastSnapshot().Job == "enemy") {
                var jobIconSrc = "/static/img/enemy.png";
            }
            this.drawImage(
                jobIconSrc,
                this.getViewWidth() > GRID_BREAKPOINT_MOBILE ? 16 : 8,
                this._ES("key_height") + ((combatantCount + 1) * this._ES("combatant_height")) - ((this._ES("combatant_height") + this._ES("job_icon_width")) / 2) - this.vOffset,
                this._ES("job_icon_width"),
                this._ES("job_icon_height")
            );
            // draw combatant name
            if (this.getViewWidth() > GRID_BREAKPOINT_MOBILE) {
                this.canvasContext.fillStyle = TIMELINE_ROLE_COLORS[combatant.getRole()][1];
                this.canvasContext.textBaseline = "middle";
                this.canvasContext.fillText(
                    combatant.getDisplayName(),
                    this._ES("job_icon_width") + 24,
                    this._ES("key_height") + (combatantCount * this._ES("combatant_height")) + (this._ES("combatant_height") / 2) - this.vOffset
                );
            }

            // draw seperator line
            this.canvasContext.fillStyle = "#fff";
            this.canvasContext.fillRect(
                0,
                this._ES("key_height") + (combatantCount * this._ES("combatant_height") - 1) - this.vOffset,
                this.getViewWidth(),
                1
            );
            this.canvasContext.fillRect(
                0,
                this._ES("key_height") + ((combatantCount + 1) * this._ES("combatant_height") - 1) - this.vOffset,
                this.getViewWidth(),
                1
            );
        }
        // draw vertical seperator
        this.canvasContext.fillRect(
            this._ES("combatant_width"), 0, 1, this.getViewHeight()
        );
    }
    
    /**
     * Draw timestamps.
     */
    drawTimeKeys()
    {
        super.drawTimeKeys(this.encounter);
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
            drawEndTime = new Date(this.encounter.data.StartTime.getTime() + this.seek);
        }    
        // get start time to draw from
        var drawDuration = Math.ceil((this.getViewWidth() - this._ES("combatant_width")) / GRID_PIXELS_PER_MILLISECOND);
        var drawStartTime = new Date(drawEndTime.getTime() - drawDuration);
        // get actions in time frame
        var actions = this.actionCollector.findInDateRange(
            drawStartTime,
            drawEndTime
        );
        // itterate and draw actions
        this.actionPositions = [];
        for (var i in actions) {
            var action = actions[i];
            var actionDrawData = this.getActionDrawData(action);
            if (!actionDrawData || !action || !action.type || !action.displayAction) {
                continue;
            }
            // calculate position/size
            var w = this._ES(TIMELINE_ACTION_ICON_SIZE_KEYS[action.type][0]);
            var h = this._ES(TIMELINE_ACTION_ICON_SIZE_KEYS[action.type][1]);
            var x = this._ES("combatant_width") + parseInt((drawEndTime.getTime() - action.time.getTime()) * GRID_PIXELS_PER_MILLISECOND);
            var y = this._ES("key_height") + (actionDrawData.vindex * this._ES("combatant_height")) + ((this._ES("combatant_height") - h) / 2);
            this.drawImage(
                actionDrawData.icon,
                x,
                y - this.vOffset,
                w,
                h
            );

            // draw +/- for buffs/debuffs
            if (action.type == ACTION_TYPE_GAIN_STATUS_EFFECT || action.type == ACTION_TYPE_LOSE_STATUS_EFFECT) {
                this.canvasContext.font = "20px sans-serif";
                this.canvasContext.textAlign = "center";
                this.canvasContext.fillStyle = "#6def11";
                this.canvasContext.textBaseline = "middle";
                var buffText = "+";
                if (action.type == ACTION_TYPE_LOSE_STATUS_EFFECT) {
                    buffText = "-";
                }
                this.canvasContext.fillText(
                    buffText, x, y - this.vOffset
                );
            }

            // record action positions for click overlay
            this.actionPositions.push([action, x, y - this.vOffset, w, h]);
        }
    }

    /**
     * Draw overlay with details about an action.
     */
    drawOverlay()
    {
        if (!this.overlayAction) {
            return;
        }
        var w = this.getViewWidth() < 500 ? this.getViewWidth() : 500;
        var h = this.getViewHeight() < 500 ? this.getViewHeight() : 500;

        var offsetX = (this.getViewWidth() - w) / 2; 
        var offsetY = (this.getViewHeight() - h) / 2; 

        var actionDrawData = this.getActionDrawData(this.overlayAction);
        
        // draw bg
        this.canvasContext.fillStyle = "rgba(0,0,0,.75)";
        this.canvasContext.fillRect(offsetX, offsetY, w, h);

        // add padding to offset
        offsetX += 16;
        offsetY += 16;

        // draw action icon
        var iconW = this._ES(TIMELINE_ACTION_ICON_SIZE_KEYS[this.overlayAction.type][0]);
        var iconH = this._ES(TIMELINE_ACTION_ICON_SIZE_KEYS[this.overlayAction.type][1]);
        this.drawImage(
            actionDrawData.icon,
            offsetX,
            offsetY,
            iconW,
            iconH
        );

        // draw action name
        this.canvasContext.font = "24px sans-serif";
        this.canvasContext.textBaseline = "middle";
        this.canvasContext.textAlign = "left";
        this.canvasContext.fillStyle = "#fff";
        this.canvasContext.fillText(
            this.overlayAction.data.actionName,
            offsetX + iconW + 10,
            offsetY + (iconH / 2)
        );

        // break text block in to lines to draw on canvas
        // @see https://stackoverflow.com/a/16599668
        var getLines = function(ctx, text, maxWidth) {
            var words = text.split(" ");
            var lines = [];
            var currentLine = words[0];
        
            for (var i = 1; i < words.length; i++) {
                var word = words[i];
                var width = ctx.measureText(currentLine + " " + word).width;
                if (word.indexOf("\n") != -1) {
                    lines.push(currentLine);
                    currentLine = word;
                } else if (width < maxWidth) {
                    currentLine += " " + word;
                } else {
                    lines.push(currentLine);
                    currentLine = word;
                }
            }
            lines.push(currentLine);
            return lines;
        }

        // draw action description
        this.canvasContext.font = "12px sans-serif";
        this.canvasContext.textBaseline = "top";
        var lines = getLines(
            this.canvasContext,
            actionDrawData.data && actionDrawData.data.description ? actionDrawData.data.description : "(no description)",
            w - 48 - iconW
        );
        lines.push("");

        // draw type
        var actionTypeDisplayName = "Buff/Debuff";
        switch (this.overlayAction.type) {
            case ACTION_TYPE_GAIN_STATUS_EFFECT: {
                actionTypeDisplayName = "Gain Status";
                break;
            }
            case ACTION_TYPE_LOSE_STATUS_EFFECT:
            {
                actionTypeDisplayName = "Lose Status";
                break;
            }
            case ACTION_TYPE_DEATH:
            {
                actionTypeDisplayName = "Death";
                break;
            }
            case ACTION_TYPE_NORMAL:
            {
                if (this.overlayAction.data.flags.indexOf("heal") != -1) {
                    actionTypeDisplayName = "Heal";
                } else if (this.overlayAction.data.flags.indexOf("damage") != -1) {
                    actionTypeDisplayName = "Damage";
                }
                break;
            }
        }
        lines.push(actionTypeDisplayName);
        // draw extra flags, crit, direct hit
        if (this.overlayAction.type == ACTION_TYPE_NORMAL) {
            var actionFlagDisplay = "";
            var actionFlagTypes = ["crit", "direct-hit"];
            for (var i in actionFlagTypes) {
                if (this.overlayAction.data.flags.indexOf(actionFlagTypes[i]) != -1) {
                    if (actionFlagDisplay) {
                        actionFlagDisplay += ", ";
                    }
                    switch(actionFlagTypes[i]) {
                        case "crit": {
                            actionFlagDisplay += "Critical Hit";
                            break;
                        }
                        case "direct-hit":
                        {
                            actionFlagDisplay += "Direct Hit";
                            break;
                        }
                    }
                }
            }
            if (actionFlagDisplay) {
                lines.push(actionFlagDisplay);
            }
        }
        for (var i in lines) {
            this.canvasContext.fillText(
                lines[i],
                offsetX + iconW + 10,
                offsetY + iconH + 8 + (14 * i)
            );            
        }

        // draw targets of action
        var targetY = iconH + (lines.length * 14) + 14;
        this.drawActionTarget(
            this.overlayAction,
            offsetX + iconW + 10,
            offsetY + targetY
        );
        for (var i in this.overlayAction.relatedActions) {
            targetY += this._ES("job_icon_height_small") + 4;
            if (i > 6) {
                this.canvasContext.font = "14px sans-serif";
                this.canvasContext.fillStyle = "#fff";
                this.canvasContext.textAlign = "left";
                this.canvasContext.textBaseline = "top";
                this.canvasContext.fillText(
                    "+" + (this.overlayAction.relatedActions.length - 6) + " more",
                    offsetX + iconW + 10,
                    offsetY + targetY + 8
                )
                break
            }

            this.drawActionTarget(
                this.overlayAction.relatedActions[i],
                offsetX + iconW + 10,
                offsetY + targetY
            );
        }

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
        this.combatants[0].data = [{
            "Job"       : "enemy",
            "Name"      : "Enemies"
        }];
        // pet combatant
        this.combatants.push(new Combatant());
        this.combatants[1].data = [{
            "Job"       : "pet",
            "Name"      : "Pets"
        }];
        // get combatant list
        var fetchedCombatants = this.combatantCollector.getSortedCombatants("role");
        for (var i in fetchedCombatants) {
            if (!fetchedCombatants[i].isEnemy() && fetchedCombatants[i].getLastSnapshot().Job) {
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
        var actionImageSrc = "/static/img/enemy.png";
        if (!actionData && action.type == ACTION_TYPE_DEATH) {
            actionImageSrc = "/static/img/death.png";
        } else if (actionData && ["attack", "shot"].indexOf(actionData.name.toLowerCase()) != -1) {
            actionImageSrc = "/static/img/attack.png";
        } else if (!actionData && typeof(action.data.actionName) != "undefined" && ["attack", "shot"].indexOf(action.data.actionName.toLowerCase()) != -1) {
            actionImageSrc = "/static/img/attack.png";
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
     * Draw details about target of action
     * @param {Action} action 
     * @param {integer} x 
     * @param {integer} y 
     */
    drawActionTarget(action, x, y)
    {
        // draw combatant job icons
        var combatants = [action.sourceCombatant, action.targetCombatant];
        for (var i in combatants) {
            var combatant = combatants[i];
            // get job icon
            var jobIconSrc = "/static/img/enemy.png";
            if (combatant && combatant.getLastSnapshot().Job && combatant.getLastSnapshot().Job != "enemy") {
                var jobIconSrc = "/static/img/job/" + combatant.getLastSnapshot().Job.toLowerCase() + ".png";
            }
            this.drawImage(
                jobIconSrc,
                x + ((this._ES("job_icon_width_small") + 24) * i) ,
                y,
                this._ES("job_icon_width_small"),
                this._ES("job_icon_height_small")
            );
        }
        // draw arrow target sep
        this.canvasContext.font = "14px sans-serif";
        this.canvasContext.fillStyle = "#fff";
        this.canvasContext.textAlign = "center";
        this.canvasContext.textBaseline = "middle";
        this.canvasContext.fillText(
            "→",
            x + this._ES("job_icon_width_small") + 12,
            y + (this._ES("job_icon_height_small") / 2)
        );

        // draw damage/heal amount
        var damageText = "";
        var hpAfter = 0;
        if (action.data.flags.indexOf("damage") != -1) {
            hpAfter = parseInt(action.data.targetCurrentHp) - action.data.damage;
            damageText += "-" + action.data.damage;
        } else if (action.data.flags.indexOf("heal") != -1) {
            hpAfter = parseInt(action.data.targetCurrentHp) + action.data.damage;
            damageText += "+" + action.data.damage;
        }
        if (damageText) {
            if (hpAfter > action.data.targetMaxHp) {
                hpAfter = action.data.targetMaxHp;
            } else if (hpAfter < 0) {
                hpAfter = 0;
            }
            damageText += " = " + hpAfter;
            this.canvasContext.textAlign = "left";
            this.canvasContext.fillText(
                damageText,
                x + (this._ES("job_icon_width_small") * 2) + 32,
                y + (this._ES("job_icon_height_small") / 2)
            );            
        }

    }

    /** @inheritdoc */
    _scrollGrid(movement)
    {
        if (!this.mouseIsDown) {
            return;
        }
        super._scrollGrid(movement);

        this.vOffset -= movement[1];
        if (this.vOffset < 0) {
            this.vOffset = 0;
            return;
        }
        var combatants = this.getCombatantList();
        var maxVScroll = (combatants.length * this._ES("combatant_height")) - this.getViewHeight();
        if (this.vOffset > maxVScroll) {
            this.vOffset = maxVScroll;
            if (this.vOffset < 0) {
                this.vOffset = 0;
            }
        }
    }

}