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

var GRAPH_ELEMENT_SIZES = {
    "tick_width" : {
        [GRID_BREAKPOINT_FULL] : 16
    },
    "job_icon_width" : {
        [GRID_BREAKPOINT_FULL] : 24
    },
    "job_icon_height" : {
        [GRID_BREAKPOINT_FULL] : 24
    },
    "plot_point_size" : {
        [GRID_BREAKPOINT_FULL] : 8
    }
};
var COMBATANT_COLORS = [
    "#ea6e7b",
    "#6f79e1",
    "#97d876",
    "#278843",
    "#e27d5e",
    "#ba19a3",
    "#4f2f0f",
    "#2d6370",
    "#ffffff"
];

class ViewCombatantGraph extends ViewGridBase
{

    getName()
    {
        return "graph";
    }

    getTitle()
    {
        return "Graph";
    }

    init()
    {
        super.init();
        this.valueType = "dps";
        var t = this;
        setTimeout(function() {
            t.onResize();
        }, 100);

        var mouseOverAction = function(e) {
            t.currentMouseOver = null;
            var mousePos = t._getCursorPosition(e);
            for (var i = t.mouseOverPositions.length - 1; i >= 0; i--) {
                var mouseOverPosition = t.mouseOverPositions[i];
                if (
                    mousePos[0] > mouseOverPosition[1] && mousePos[1] > mouseOverPosition[2] &&
                    mousePos[0] < mouseOverPosition[1] + mouseOverPosition[3] &&
                    mousePos[1] < mouseOverPosition[2] + mouseOverPosition[4]
                ) {
                    t.currentMouseOver = [mouseOverPosition[0], mousePos[0], mousePos[1]];
                    t.needRedraw = true;
                }
            }
            return null;
        }
        this.canvasElement.addEventListener("mousemove", mouseOverAction);
    }

    reset()
    {
        super.reset();
        this.encounter = null;
        this.maxStatValue = 0;
        this.combatants = [];
        this.mouseOverPositions = [];
        this.currentMouseOver = null;
        this.addElementSizes(GRAPH_ELEMENT_SIZES);
    }

    onCombatant(combatant)
    {
        this.needRedraw = true;
        this.maxStatValue = this._getMaxValue(this.valueType);
        this.max = this.encounter.getLength();
        this.combatants = this.combatantCollector.getSortedCombatants("role");
    }

    onEncounter(encounter)
    {
        this.reset();
        this.encounter = encounter;
        this.max = this.encounter.getLength();
        this.needRedraw = true;
    }
    
    onLogLine(logLine)
    {
        this.needRedraw = true;
    }

    tick()
    {
        super.tick();
        if (this.encounter) {
            this.max = this.encounter.getLength();
        }
    }

    redraw()
    {
        super.redraw();
        this.drawPlotPoints();
        this.drawStatValueKeys();
        this.drawTimeKeys(this.encounter);
        if (this.currentMouseOver) {
            this.drawMouseOverText(
                this.currentMouseOver[0],
                this.currentMouseOver[1],
                this.currentMouseOver[2]
            );
        }
    }

    /**
     * Get max value for given stat type.
     * @param {string} name 
     */
    _getMaxValue(name)
    {
        if (!this.encounter) {
            return 0;
        }
        var startTimestamp = this.encounter.data.StartTime.getTime();
        var encounterLength = this.encounter.getLength();
        switch (name)
        {
            case "dps":
            {
                var maxDps = 0;
                for (var i = (encounterLength > 10000 ? 10 : 1); i < Math.ceil(encounterLength / 1000); i++) {
                    var timeIndex = new Date(startTimestamp + (i * 1000));
                    for (var j in this.combatantCollector.combatants) {
                        var combatant = this.combatantCollector.combatants[j];
                        var snapshot = combatant.getSnapshot(timeIndex);
                        if (!snapshot) {
                            continue;
                        }
                        var dps = Math.floor(snapshot.Damage / i);
                        if (dps > maxDps) {
                            maxDps = dps;
                        }
                    }
                }
                return maxDps;
            }
        }
        return 0;
    }

    /**
     * Draw stat value keys on left side of grid.
     */
    drawStatValueKeys()
    {
        if (!this.encounter) {
            return;
        }
        // draw background
        this.canvasContext.fillStyle = "#404040";
        this.canvasContext.fillRect(
            0, 0, this._ES("key_width"), this.getViewHeight()
        );

        // plot vertical area
        var plotTop = this._ES("key_height") + 16
        var plotBtm = this.getViewHeight() - 16;
        var plotVals = [this.maxStatValue, Math.floor(this.maxStatValue / 2), 0];
        var plotPosIncs = (plotBtm - plotTop) / (plotVals.length - 1);
        for (var i in plotVals) {
            // draw tick for max value
            this.canvasContext.fillStyle = "#fff";
            this.canvasContext.fillRect(
                this._ES("key_width") - (this._ES("tick_width") / 2), plotTop + (plotPosIncs * i), this._ES("tick_width"), 1
            );
            // draw max value
            this.canvasContext.font = "14px sans-serif";
            this.canvasContext.textAlign = "left";
            this.canvasContext.textBaseline = "middle";
            this.canvasContext.fillText(
                plotVals[i],
                8,
                plotTop + (plotPosIncs * i)
            );
        }

        // combatant keys
        for (var i in this.combatants) {
            if (i >= COMBATANT_COLORS.length) {
                continue;
            }
            var combatant = this.combatants[i]
            // draw role icon
            var jobIconSrc = "/static/img/job/" + combatant.getLastSnapshot().Job.toLowerCase() + ".png";
            var vPos = 32 + this._ES("key_height") + (this._ES("job_icon_height") * i);
            this.drawImage(
                jobIconSrc,
                8,
                vPos,
                this._ES("job_icon_width"),
                this._ES("job_icon_height")
            );
            this.canvasContext.fillStyle = COMBATANT_COLORS[i];
            this.canvasContext.fillRect(
                8 + this._ES("job_icon_width") + 1,
                vPos + 1,
                this._ES("job_icon_width") - 2,
                this._ES("job_icon_height") - 2
            );
            
        }
    }

    /**
     * Draw plot points.
     */
    drawPlotPoints()
    {
        if (!this.max || !this.encounter) {
            return;
        }
        // init values
        this.mouseOverPositions = [];
        var plotTop = this._ES("key_height") + 16
        var plotBtm = this.getViewHeight() - 16;
        var plotSize = plotBtm - plotTop;
        var pointSize = this._ES("plot_point_size");

        // get current seek
        var currentSeek = this.max;
        if (this.seek) {
            currentSeek = this.seek;
        }
        // hor offset
        var hOffset = currentSeek * GRID_PIXELS_PER_MILLISECOND;
        // init last values
        var lastHpos = 9999;
        var lastVpos = [];
        for (var i = 0; i < this.combatants.length; i++) {
            lastVpos.push(0);
        }
        // max hor distance to draw
        var viewMax = Math.ceil(currentSeek / 1000);
        var viewMin = viewMax - Math.ceil((this.getViewWidth() / GRID_PIXELS_PER_MILLISECOND) / 1000) - 1;      
        // itterate each second in viewport
        for (var i = viewMin; i < viewMax; i++) {
            var timeIndex = new Date(this.encounter.data.StartTime.getTime() + (i * 1000));
            var hPos = hOffset - (GRID_PIXELS_PER_MILLISECOND * (i * 1000));
            for (var j in this.combatants) {
                if (j >= COMBATANT_COLORS.length) {
                    continue;
                }
                // get combatant and snapshot for current time
                var combatant = this.combatants[j];
                var snapshot = combatant.getSnapshot(timeIndex);
                if (!snapshot) {
                    continue;
                }
                // get plot value
                var value = 0;
                switch (this.valueType) {
                    case "dps":
                    {
                        value = snapshot.Damage / i;
                        break;
                    }
                }
                var vPos = plotBtm - (value / (this.maxStatValue / plotSize));
                this.canvasContext.fillStyle = COMBATANT_COLORS[j];
                this.canvasContext.fillRect(
                    hPos, vPos, pointSize, pointSize
                );
                this.mouseOverPositions.push([
                    combatant.getDisplayName() + " (" + value.toFixed(2) + ")", hPos, vPos, pointSize, pointSize
                ]);

                // draw line to last point
                if (i > 1) {
                    this.canvasContext.strokeStyle = COMBATANT_COLORS[j];
                    this.canvasContext.beginPath()
                    this.canvasContext.moveTo(lastHpos + (pointSize / 2), lastVpos[j] + (pointSize / 2));
                    this.canvasContext.lineTo(hPos + (pointSize / 2), vPos + (pointSize / 2));
                    this.canvasContext.stroke();
                }

                // set last vpos
                lastVpos[j] = vPos;

            }
            // set last hpos
            lastHpos = hPos;

        }
    }

}
