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

var MODAL_ELEMENT_ID = "modalOverlay";
var MODAL_BODY_ELEMENT_ID = "modalBody";

class Modal 
{

    static getModalElement()
    {
        return document.getElementById(MODAL_ELEMENT_ID);
    }

    static getModalBodyElement()
    {
        return document.getElementById(MODAL_BODY_ELEMENT_ID);
    }

    static _closeEvent(event)
    {
        switch (event.type)
        {
            case "click":
            {
                if (event.target == Modal.getModalElement()) {
                    Modal.close();
                } else if (event.target == document.getElementById("modalClose")) {
                    Modal.close();
                }
                break;   
            }
            case "keydown":
            {
                if (event.key == "Escape") {
                    Modal.close();
                }
                break;
            }
        }
    }

    static close()
    {
        Modal.getModalElement().classList.add("hide");
        Modal.getModalElement().removeEventListener("click", Modal._closeEvent);
        Modal.getModalElement().removeEventListener("keydown", Modal._closeEvent);
        document.getElementById("modalClose").removeEventListener("click", Modal._closeEvent);
    }

    static open()
    {
        Modal.getModalElement().classList.remove("hide");
        Modal.getModalElement().addEventListener("click", Modal._closeEvent);
        document.getElementById("modalClose").addEventListener("click", Modal._closeEvent);
        window.addEventListener("keydown", Modal._closeEvent);
    }

    static reset()
    {
        Modal.getModalBodyElement().innerHTML = "";
    }

    static addText(value)
    {
        var textElement = document.createElement("div");
        textElement.classList.add("modalText");
        textElement.innerText = value;
        Modal.getModalBodyElement().appendChild(textElement);
    }

    static addSection(value)
    {
        var sectionElement = document.createElement("div");
        sectionElement.classList.add("modalSection");
        sectionElement.innerText = value;
        Modal.getModalBodyElement().appendChild(sectionElement);
    }

    static _createCheckbox(name, checked)
    {
        var checkboxContainerElement = document.createElement("div");
        checkboxContainerElement.classList.add(
            "modalCheckbox",
            "modalCheckbox-" + name
        );
        var checkboxLabelElement = document.createElement("label");
        var checkboxElement = document.createElement("input");
        checkboxElement.type = "checkbox";
        checkboxElement.name = name;
        if (checked) {
            checkboxElement.checked = true;
        }
        checkboxLabelElement.appendChild(checkboxElement);
        checkboxContainerElement.appendChild(checkboxLabelElement);
        return checkboxContainerElement;
    }

    static addCheckbox(name, label, checked, callback)
    {
        var checkboxContainerElement = Modal._createCheckbox(name, checked);
        checkboxContainerElement.getElementsByTagName("label")[0].appendChild(
            document.createTextNode(label)
        );
        Modal.getModalBodyElement().appendChild(checkboxContainerElement);
        if (callback) {
            var callback = callback;
            var name = name;
            checkboxContainerElement.getElementsByTagName("input")[0].addEventListener("click", function(e) {
                callback(name, e.target.checked);
            });
        }
    }

    static addCheckboxImage(name, image, alt, checked, callback)
    {
        var checkboxContainerElement = Modal._createCheckbox(name, checked);
        checkboxContainerElement.classList.add("modalCheckboxImage");
        var checkboxImageElement = document.createElement("img");
        checkboxImageElement.src = image;
        checkboxImageElement.alt = alt 
        checkboxImageElement.title = alt;
        checkboxImageElement.classList.add("loading");
        checkboxImageElement.addEventListener("load", function(e) {
            e.target.classList.remove("loading");
        });
        checkboxContainerElement.getElementsByTagName("label")[0].appendChild(checkboxImageElement);
        Modal.getModalBodyElement().appendChild(checkboxContainerElement);
        if (callback) {
            var callback = callback;
            var name = name;
            checkboxContainerElement.getElementsByTagName("input")[0].addEventListener("click", function(e) {
                callback(name, e.target.checked);
            });
        }
    }
 
    static addChoices(name, choices, currentValue, callback)
    {
        var choicesContainerElement = document.createElement("div");
        choicesContainerElement.classList.add(
            "modalChoices",
            "modalChoices-" + name
        );
        for (var key in choices) {
            var choiceContainerElement = document.createElement("div");
            choiceContainerElement.classList.add(
                "modalChoicesChoice",
                "modalChoicesChoice-" + key
            );
            var choiceLabelElement = document.createElement("label");
            var choiceRadioElement = document.createElement("input");
            choiceRadioElement.type = "radio"
            choiceRadioElement.name = name;
            choiceRadioElement.value = key;
            choiceLabelElement.appendChild(choiceRadioElement);
            choiceLabelElement.appendChild(
                document.createTextNode(choices[key])
            );
            choiceContainerElement.appendChild(choiceLabelElement);
            if (currentValue && key == currentValue) {
                choiceRadioElement.checked = true;
            }
            if (callback) {
                var name = name;
                var callback = callback;
                choiceRadioElement.addEventListener("click", function(e) {
                    callback(name, e.target.value);
                });
            }
            choicesContainerElement.appendChild(choiceContainerElement);
        }
        Modal.getModalBodyElement().appendChild(choicesContainerElement);
    }

    static addTextbox(name, label, value, callback)
    {
        var textContainerElement = document.createElement("div");
        textContainerElement.classList.add(
            "modalTextbox",
            "modalTextbox-" + name
        );

        var textLabelElement = document.createElement("label");
        textLabelElement.appendChild(
            document.createTextNode(label)
        );
        var textElement = document.createElement("input");
        textElement.type = "text";
        textElement.name = name;
        if (value) {
            textElement.value = value;
        }
        textLabelElement.appendChild(textElement);
        textContainerElement.appendChild(textLabelElement);
        Modal.getModalBodyElement().appendChild(textContainerElement);
        if (callback) {
            var name = name;
            var callback = callback;
            textElement.addEventListener("change", function(e) {
                callback(name, e.target.value);
            });
        }
    }

    static addTextArea(name, value, callback)
    {
        var textareaContainerElement = document.createElement("div");
        textareaContainerElement.classList.add(
            "modalTextArea",
            "modalTextArea-" + name
        );
        var textAreaElement = document.createElement("textarea");
        textAreaElement.name = name;
        if (value) {
            textAreaElement.innerText = value;
        }
        textareaContainerElement.appendChild(textAreaElement);
        Modal.getModalBodyElement().appendChild(textareaContainerElement);
        if (callback) {
            var name = name;
            var callback = callback;
            textAreaElement.addEventListener("change", function(e) {
                callback(name, e.target.innerText);
            });
        }
    }

    static addButtons(buttons, callback)
    {
        var buttonsContainerElement = document.createElement("div");
        buttonsContainerElement.classList.add("modalButtons");
        for (var key in buttons) {
            var buttonElement = document.createElement("button");
            buttonElement.name = key;
            buttonElement.innerText = buttons[key];
            buttonsContainerElement.appendChild(buttonElement);
            if (callback) {
                var callback = callback;
                buttonElement.addEventListener("click", function(e) {
                    callback(e.target.name);
                });
            }
        }
        Modal.getModalBodyElement().appendChild(buttonsContainerElement);
    }

}