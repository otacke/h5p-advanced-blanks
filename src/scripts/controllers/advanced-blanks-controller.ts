﻿import { Cloze } from "../models/cloze";
import { Feedback } from "../models/feedback";
import { IDataRepository } from "../services/data-repository";
import { Settings } from "../models/settings";
import { H5PLocalization, LocalizationLabels } from "../services/localization";
import { ClozeType } from "../models/enums";
import { Highlight } from "../models/highlight";
import { Blank } from "../models/blank";

import * as RactiveEventsKeys from "../../lib/ractive-events-keys"
import * as Ractive from 'ractive';

export class AdvancedBlanksController {
  private cloze: Cloze;
  private feedback: Feedback;
  private checkAllLabel: string;
  private isSelectCloze: boolean;

  // Storage of the ractive objects that link models and views
  private highlightRactives: { [id: string]: Ractive.Ractive } = {};
  private blankRactives: { [id: string]: Ractive.Ractive } = {};
  private staticRactive: Ractive.Ractive;

  constructor(private repository: IDataRepository, private jquery: JQuery) {
  }
  /**
   * Sets up all blanks, the cloze itself and the ractive bindings.
   * @param  {HTMLElement} root
   */
  initialize(root: HTMLElement) {
    this.isSelectCloze = Settings.instance.clozeType == ClozeType.Select ? true : false;
    this.checkAllLabel = H5PLocalization.getInstance().getTextFromLabel(LocalizationLabels.checkAllButton);
    this.feedback = new Feedback(this.repository.getFeedbackText());

    var blanks = this.repository.getBlanks();

    var snippets = this.repository.getSnippets();
    blanks.forEach(blank => blank.replaceSnippets(snippets));

    var mediaElements = this.repository.getMediaElements();

    this.cloze = Cloze.createCloze(this.repository.getClozeText(), blanks, mediaElements);

    var containers = this.createAndAddContainers(root);
    containers.cloze.innerHTML = this.cloze.html;
    this.createRactiveBindings();
  }

  private createAndAddContainers(addTo: HTMLElement): { cloze: HTMLDivElement, static: HTMLDivElement } {
    var clozeContainerElement = document.createElement('div');
    clozeContainerElement.id = 'clozeContainer';
    addTo.appendChild(clozeContainerElement);

    var staticContainerElement = document.createElement('div');
    staticContainerElement.id = 'staticContainer';
    addTo.appendChild(staticContainerElement);

    return {
      cloze: clozeContainerElement,
      static: staticContainerElement
    };
  }

  private createHighlightBinding(highlight: Highlight) {
    this.highlightRactives[highlight.id] = new Ractive({
      el: '#container_' + highlight.id,
      template: require('../views/highlight.ractive.html'),
      data: {
        object: highlight
      }
    });
  }

  private createBlankBinding(blank: Blank) {
    var ractive = new Ractive({
      el: '#container_' + blank.id,
      template: require('../views/blank.ractive.html'),
      data: {
        isSelectCloze: this.isSelectCloze,
        blank: blank
      },
      events: {
        enter: RactiveEventsKeys.enter,
        escape: RactiveEventsKeys.escape
      }
    });
    ractive.on("checkCloze", this.onCheckBlank);
    ractive.on("showHint", this.onShowHint);
    ractive.on("closeMessage", this.onRequestCloseHighlight);

    this.blankRactives[blank.id] = ractive;
  }

  private bindStatic() {
    this.staticRactive = new Ractive({
      el: '#staticContainer',
      template: require('../views/static.ractive.html'),
      data: {
        feedback: this.feedback,
        checkAllLabel: this.checkAllLabel,
      }
    });
    this.staticRactive.on("checkAll", this.onCheckAll);
    this.staticRactive.on("checkCloze", this.onCheckBlank);
    this.staticRactive.on("closeFeedback", this.onRequestCloseFeedback);
  }

  private createRactiveBindings() {
    for (var highlight of this.cloze.highlights) {
      this.createHighlightBinding(highlight);
    }

    for (var blank of this.cloze.blanks) {
      this.createBlankBinding(blank);
    }

    this.bindStatic();
  }

  /**
   * Updates all views of highlights and blanks. Can be called when a model
   * was changed
   */
  private refreshCloze() {
    for (var highlight of this.cloze.highlights) {
      var highlightRactive = this.highlightRactives[highlight.id];
      highlightRactive.set("object", highlight);
    }

    for (var blank of this.cloze.blanks) {
      var blankRactive = this.blankRactives[blank.id];
      blankRactive.set("blank", blank);
    }
  }

  onRequestCloseFeedback = () => {
    this.feedback.isVisible = false;
    this.staticRactive.set("feedback", this.feedback);
  }

  private checkAndNotifyCompleteness = (): boolean => {
    if (this.cloze.checkCompleteness()) {
      this.repository.setSolved();
      this.feedback.isVisible = true;
      this.staticRactive.set("feedback", this.feedback);
      return true;
    }

    return false;
  }

  onCheckAll = () => {
    this.hideAllHighlights();
    for (var blank of this.cloze.blanks) {
      if ((!blank.isCorrect) && blank.enteredText != "")
        blank.evaluateEnteredAnswer();
    }
    this.refreshCloze();
    this.checkAndNotifyCompleteness();
  }

  onShowHint = (blank: Blank) => {
    this.hideAllHighlights();
    blank.showHint();
    this.refreshCloze();
  }

  onRequestCloseHighlight = (blank: Blank) => {
    blank.removeTooltip();
    this.refreshCloze();
    this.jquery.find("#" + blank.id).focus();
  }

  onCheckBlank = (blank: Blank) => {
    this.hideAllHighlights();
    blank.evaluateEnteredAnswer();
    this.refreshCloze();

    if (!this.checkAndNotifyCompleteness()) {
      if (blank.isCorrect) {
        // move to next blank
        var index = this.cloze.blanks.indexOf(blank);
        if (index + 1 >= this.cloze.blanks.length)
          return;
        var nextId = this.cloze.blanks[index + 1].id;
        this.jquery.find("#" + nextId).focus();
      }
    }
  }

  private hideAllHighlights(): void {
    for (var highlight of this.cloze.highlights) {
      highlight.isHighlighted = false;
    }
  }
}