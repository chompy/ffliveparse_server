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
        this.buildBaseElements();
        this.onResize();
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
            this.canvasElement.style.width = this.getViewWidth() + "px";
            this.canvasElement.style.height = this.getViewHeight() + "px";
        }
    }

}