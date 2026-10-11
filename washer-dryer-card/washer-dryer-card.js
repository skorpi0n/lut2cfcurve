class WasherDryerCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  setConfig(config) {
    this._config = {
      ...config,
      variant: config.variant === undefined ? "Washer" : config.variant
    };
    this._rendered = false;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;

    if (!this._rendered) {
      this._render();
    }
  }

  _render() {
    if (!this._hass || !this._config || this._rendered) {
      return;
    }

    this._rendered = true;

    this.shadowRoot.innerHTML = "";

    const style = document.createElement("style");

    style.textContent = `
      ha-entity-picker {
        display: block;
        width: 100%;
        margin-bottom: 16px;
      }
    `;
    
    this.shadowRoot.appendChild(style);

    const variantSelect = document.createElement("ha-select");
    
    variantSelect.label = "Variant";
    variantSelect.style.width = "100%";
    variantSelect.style.marginBottom = "16px";
    variantSelect.value = this._config.variant === "Dryer" ? "Dryer" : "Washer";
    this._config = {
      ...this._config,
      variant: variantSelect.value
    };

    const washerOption = document.createElement("ha-dropdown-item");
    washerOption.value = "Washer";
    washerOption.textContent = "Washer";
    
    const dryerOption = document.createElement("ha-dropdown-item");
    dryerOption.value = "Dryer";
    dryerOption.textContent = "Dryer";

    variantSelect.appendChild(washerOption);
    variantSelect.appendChild(dryerOption);
    variantSelect.addEventListener("selected", (ev) => {
      const variant = ev.detail?.value;
    
      if (variant !== "Washer" && variant !== "Dryer") {
        return;
      }
    
      this._config = {
        ...this._config,
        variant,
      };
    
      variantSelect.value = variant;
      this._fireConfigChanged();
    });

    // Job state
    const jobStatePicker = document.createElement("ha-entity-picker");

    jobStatePicker.hass = this._hass;
    jobStatePicker.value = this._config.job_state_entity || "";

    jobStatePicker.label = "Job state entity";

    jobStatePicker.addEventListener("value-changed", (ev) => {
      this._config = {
        ...this._config,
        job_state_entity: ev.detail.value,
      };

      this._fireConfigChanged();
    });

    // Completion time
    const completionPicker = document.createElement("ha-entity-picker");

    completionPicker.hass = this._hass;
    completionPicker.value = this._config.completion_time_entity || "";

    completionPicker.label = "Completion time entity";

    completionPicker.addEventListener("value-changed", (ev) => {
      this._config = {
        ...this._config,
        completion_time_entity: ev.detail.value,
      };

      this._fireConfigChanged();
    });

    this.shadowRoot.appendChild(variantSelect);
    this.shadowRoot.appendChild(jobStatePicker);
    this.shadowRoot.appendChild(completionPicker);
  }

  _fireConfigChanged() {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: {
          config: this._config,
        },
        bubbles: true,
        composed: true,
      })
    );
  }
}
customElements.define(
  "washer-dryer-card-editor",
  WasherDryerCardEditor
);

class WasherDryerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  
    this._lastJobState = null;
    this._lastReadableState = null;
    this._completedJobState = null;
    this._completionTimer = null;
  }
  static getStubConfig() {
    return {
      variant: "Washer",
      job_state_entity: "",
      completion_time_entity: ""
    };
  }
  static getConfigElement() {
    return document.createElement("washer-dryer-card-editor");
  }
  connectedCallback() {
    this.render();
  }

  // Show displayed state
  _updateDisplayedState(readableState, jobState) {
    console.log(readableState, jobState)
    console.log("this._completedJobState: " + this._completedJobState)
    if (this._jobText) {
      if (jobState !== "none") {
        this._jobText.textContent = readableState;
      }
      else if (this._completedJobState !== null) {
        this._jobText.textContent = this._completedJobState;
      }
      else {
        this._jobText.textContent = "";
      }
    }
  }

  // Show remaining time
  _updateRemainingTime(completionTime, jobState) {
    let remainingText = "--:--";

    if (jobState === "none") {
      if (this._completedJobState !== null) {
        remainingText = "00:00";
      }
    }
    else if (jobState === "finish") {
     remainingText = "00:00";
    }
    else {
      const completion = new Date(completionTime);

      if (!Number.isNaN(completion.getTime())) {
        const diffMs = completion - new Date();  
        const totalMinutes = Math.max(1, Math.ceil(diffMs / 60000));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        remainingText =
          `${hours.toString().padStart(2, "0")}:` +
          `${minutes.toString().padStart(2, "0")}`;
      }
    }
    if (this._timerText) {
      this._timerText.textContent = remainingText;
      if (jobState === "delay_wash"){
        this._timerText.classList.add("blink");
      }
      else{
        this._timerText.classList.remove("blink");
      }
    }
  }

  // Update visual state
  _updateVisualState(variant, jobState) {
    if (variant === "Washer") {
      switch (jobState) {
        case "none":
          this._setBubbleState("stalled");
          this._setHeatState(null);
          this._setSwirlState(null);
          break;
        case "weight_sensing":
          this._setBubbleState("stalled");
          this._setHeatState(null);
          this._setSwirlState("sense");
          break;
        case "rinse":
        case "ai_rinse":
          this._setBubbleState("flow");
          this._setHeatState(null);
          this._setSwirlState("rinse");
          break;
        case "wash":
        case "pre_wash":
        case "air_wash":
        case "ai_wash":
          this._setBubbleState("flow");
          this._setHeatState(null);
          this._setSwirlState("wash");
          break;
        case "spin":
        case "ai_spin":
          this._setBubbleState("stalled");
          this._setHeatState(null);
          this._setSwirlState("spin");
          break;
        case "drying":
          this._setBubbleState(null);
          this._setHeatState("anim");
          this._setSwirlState("wash");
          break;
        case "freeze_protection":
          this._setBubbleState(null);
          this._setHeatState("anim");
          this._setSwirlState(null);
          break;
        case "cooling":
          this._setBubbleState(null);
          this._setHeatState(null);
          this._setSwirlState("rinse");
          break;
        case "finish":
          this._setBubbleState("stalled");
          this._setHeatState(null);
          this._setSwirlState(null);
          break;
        case "delay_wash":
          this._setBubbleState("stalled");
          this._setHeatState(null);
          this._setSwirlState(null);
          break;
        default:
          this._setBubbleState("stalled");
          this._setHeatState(null);
          this._setSwirlState(null);
          break;
      }
    }
    else if(variant === "Dryer"){
      switch (jobState) {
        case "none":
          this._setBubbleState(null);
          this._setHeatState("stalled");
          this._setSwirlState(null);
          break;
        case "weight_sensing":
          this._setBubbleState(null);
          this._setHeatState("stalled");
          this._setSwirlState("sense");
          break;
        case "drying":
        case "ai_drying":
        case "sanitizing":
        case "internal_care":
        case "refreshing":
        case "wrinkle_prevent":
          this._setBubbleState(null);
          this._setHeatState("anim");
          this._setSwirlState("wash");
          break;
        case "dehumidifying":
        case "continuous_dehumidifying":
          this._setBubbleState("flow");
          this._setHeatState("anim");
          this._setSwirlState("rinse");
          break;
        case "finished":
          this._setBubbleState(null);
          this._setHeatState("stalled");
          this._setSwirlState(null);
          break;
        case "cooling":
          this._setBubbleState(null);
          this._setHeatState(null);
          this._setSwirlState("rinse");
          break;
        case "freeze_protection":
        case "thawing_frozen_inside":
          this._setBubbleState(null);
          this._setHeatState("anim");
          this._setSwirlState(null);
          break;
        case "delay_wash":
          this._setBubbleState("stalled");
          this._setHeatState(null);
          this._setSwirlState(null);
          break;
        default:
          this._setBubbleState(null);
          this._setHeatState("stalled");
          this._setSwirlState(null);
          break;
      }
    }
    else{
      throw new Error("Variant type unknown. Can be Washer or Dryer");
    }
  }

  _setSwirlState(state) {
    this._swirlGroup.classList.add("hidden");
    this._swirlGroup.classList.remove(
      "swirl-sense",
      "swirl-rinse",
      "swirl-wash",
      "swirl-spin"
    );

    if (state == "stalled"){
      this._swirlGroup.classList.remove("hidden");
    }
    else if (state == "sense") {
      this._swirlGroup.classList.remove("hidden");
      this._swirlGroup.classList.add("swirl-sense");
    }
    else if (state == "rinse") {
      this._swirlGroup.classList.remove("hidden");
      this._swirlGroup.classList.add("swirl-rinse");
    }
    else if (state == "wash") {
      this._swirlGroup.classList.remove("hidden");
      this._swirlGroup.classList.add("swirl-wash");
    }
    else if (state == "spin") {
      this._swirlGroup.classList.remove("hidden");
      this._swirlGroup.classList.add("swirl-spin");
    }
  }

  _setBubbleState(state) {
    this._bubbleGroup.classList.add("hidden");
    this._bubble1.classList.remove("bubble-flow-1");
    this._bubble2.classList.remove("bubble-flow-2");
    this._bubble3.classList.remove("bubble-flow-3");
    if (state == "stalled"){
      this._bubbleGroup.classList.remove("hidden");

    }
    else if (state == "flow") {
      this._bubbleGroup.classList.remove("hidden");
      this._bubble1.classList.add("bubble-flow-1");
      this._bubble2.classList.add("bubble-flow-2");
      this._bubble3.classList.add("bubble-flow-3");
    }
  }
  
  _setHeatState(state) {
    this._heatGroup.classList.add("hidden")
    this._heatGroup.classList.remove("heat-anim");

    if (state == "stalled"){
      this._heatGroup.classList.remove("hidden");
    }
    else if (state == "anim") {
      this._heatGroup.classList.remove("hidden");
      this._heatGroup.classList.add("heat-anim");
    }
  }

  set hass(hass) {
    this._hass = hass;
  
    if (!this._bubbleGroup || !this._heatGroup || !this._swirlGroup) {
      return;
    }
  
    const variant = this.config.variant;
    const machineState = this.config.machine_state_entity
      ? hass.states[this.config.machine_state_entity]?.state
      : undefined;

    // Read entity states
    const jobStateEntity = hass.states[this.config.job_state_entity];
    const jobState = jobStateEntity?.state;

    const completionEntity = hass.states[this.config.completion_time_entity];
    const completionTime = completionEntity?.state;


    const readableState = jobStateEntity
      ? hass.formatEntityState(jobStateEntity)
      : "Unknown";

    // Detect when the jobState becomes none
    if (
      jobState === "none" &&
      this._lastJobState !== null &&
      this._lastJobState !== "none"
    ) {
      this._completedJobState = this._lastReadableState;

      clearTimeout(this._completionTimer);
      this._completionTimer = setTimeout(() => {
        console.log("==============timer finished")
        this._completedJobState = null;
        this._completionTimer = null;
    
        if (this._hass) {
          this._hass = this._hass;
          this._updateDisplayedState();
        }
      }, 5 * 60 * 1000); //When jobState goes to none, let the last jobState remain for this amount of time
    }

    // Save the last readableState when jobState is not none
    if (jobState !== "none") {
      this._lastReadableState = readableState;
    }

    // Update lastJobState
    this._lastJobState = jobState;

    // Show remaining time
    this._updateRemainingTime(completionTime, jobState);

    // Show displayed state
    this._updateDisplayedState(readableState, jobState);

    // Show visual state
    this._updateVisualState(this.config.variant, jobState);
  }

  // The user supplied configuration. Throw an exception and Home Assistant
  // will render an error card.
  setConfig(config) {
    if (!config.variant) {
      throw new Error("Variant type required");
    }
  
    if (!config.job_state_entity) {
      throw new Error("Job state entity required");
    }
  
    if (!config.completion_time_entity) {
      throw new Error("Completion time entity required");
    }
  
    this.config = config;
  }

  // receive the states updates and checks if the card needs a rerender
  _updateStates = (states, unsubscribe) => {
    // Store the unsubscribe function so we can call it when the card is removed from the DOM
    this._unsubscribe = unsubscribe;

    const entityId = this.config.entity;
    const state = states[entityId];
    const stateString = state ? state.state : "unavailable";
    if (this.stateString !== stateString) {
      this.stateString = stateString;
      this._render();
    }
  }

  // renders the html of the card, just if needed
  render = () => {
    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          .container {
            padding: 12px;
          }
          .machine-svg {
            transform: scale(1);
            transform-origin: top left;
          }
          .hidden {
            opacity: 0;
            pointer-events: none;
          }
          /*  Machine */
          .machine-group {
            display: block;
            margin: 0 auto;
          }
          .remaining-time {
            position:absolute;
            color:light-dark(white, black);
            font-size: 3.5em;
            font-family: Courier New;
            font-weight: bold;
          }
          .job-state-text{
            position:absolute;
            text-anchor: middle;
            text-align: center;
            color: light-dark(white, black);
            font-size: 2.2em;
            font-family: Helvetica;
            font-weight: bold;
          }
          .blink {
            animation: blink 2s infinite;
          }
          @keyframes blink {
            50% {
              opacity: 0;
            }
          }

          /*  Swirl */
          .arc {
            fill: none;
            stroke: #ccc;
            stroke-width: 15;
            stroke-linecap: butt;
          
          }
          .left {
            transform: rotate(180deg);
            transform-origin: center;
          }
          .right {
            transform: rotate(0deg);
            transform-origin: center;
          }
          .outer {
            stroke: #ccc;
            stroke-dasharray: 133 400;  //130*2*pi
          }
          .inner {
            stroke: #ccc;
            stroke-dasharray: 102 306;   //90*2*pi
          }
          .swirl-spin {
            transform-origin: center;
            transform-box: fill-box;
            animation: spin 0.4s linear infinite;
          }
          .swirl-wash, .swirl-sense {
            transform-origin: center;
            transform-box: fill-box;
            animation: wash 8s ease-in-out infinite;
          }
          .swirl-rinse {
            transform-origin: center;
            transform-box: fill-box;
            animation: rinse 8s ease-in-out infinite;
          }
          @keyframes rinse {
            0% {
              transform: rotate(0deg);
            }
            50% {
              transform: rotate(360deg);
            }
            100% {
              transform: rotate(0deg);
            }
          }
          @keyframes wash {
            0% {
              transform: rotate(0deg);
            }
            50% {
              transform: rotate(720deg);
            }
            100% {
              transform: rotate(0deg);
            }
          }
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          /*  Bubbles */
          .bubble{
            fill: #fff;
            stroke: rgba(28, 163, 236, 0.5);
            stroke-width: 6;
            z-index: 100;
          }
          .bubble-flow-1{
            animation: bubble-flow-1 3s linear infinite;
          }
          .bubble-flow-2{
            animation: bubble-flow-2 2s linear infinite;
          }
          .bubble-flow-3{
            animation: bubble-flow-3 4s linear infinite;
          }
          @keyframes bubble-flow-1 {
            0% {
              transform: translate(-10px, 50px);
              opacity: 0;
            }
            25% {
              transform: translate(0px, 30px);
              opacity: 1;
            }
            50% {
              transform: translate(10px, -10px);
              opacity: 1;
            }
            75% {
              transform: translate(0px, -40px);
              opacity: 0.8;
            }
            100% {
              transform: translate(-10px, -80px);
              opacity: 0;
            }
          }
          @keyframes bubble-flow-2 {
            0% {
              transform: translate(-10px, 70px);
              opacity: 0;
            }
            25% {
              transform: translate(0px, 50px);
              opacity: 1;
            }
            50% {
              transform: translate(10px, 10px);
              opacity: 1;
            }
            75% {
              transform: translate(0px, -ยง0px);
              opacity: 0.8;
            }
            100% {
              transform: translate(-10px, -60px);
              opacity: 0;
            }
          }
          @keyframes bubble-flow-3 {
            0% {
              transform: translate(-10px, 30px);
              opacity: 0;
            }
            25% {
              transform: translate(0px, 10px);
              opacity: 1;
            }
            50% {
              transform: translate(10px, -30px);
              opacity: 1;
            }
            75% {
              transform: translate(0px, -60px);
              opacity: 0.8;
            }
            100% {
              transform: translate(-10px, -100px);
              opacity: 0;
            }
          }

          /*  Heat */
          .heat-wave {
            fill: none;
            stroke: #000;
            stroke-width: 17;
            stroke-linecap: round;
            opacity: 0.3;
            z-index: 100;
          }
          .heat-anim{
            animation: heat-gradient 2.5s linear infinite;
          }
          @keyframes heat-gradient {
            0% {
              opacity: 0;
              transform: scale(0.66) translateY(40px);
            }
            25% {
              opacity: 0.5;
              transform: scale(0.66) translateY(20px);
            }
            50% {
              opacity: 1;
              transform: scale(0.66) translateY(0px);
            }
            75% {
              opacity: 0.5;
              transform: scale(0.66) translateY(-20px);
            }
            100% {
              opacity: 0;
              transform: scale(0.66) translateY(-40px);
            }
          }
        </style>

        <div class="container">
          <svg class="machine-svg" viewBox="0 0 400 500">
            <g class="machine-group">
              <rect
                x="20"
                y="20"
                width="360"
                height="460"
                rx="30"
                fill="#fff"
                stroke="#000"
                stroke-width="4"
              />
              <circle
                cx="80"
                cy="80"
                r="25"
                fill="#000"
              />
              <circle
                cx="160"
                cy="80"
                r="25"
                fill="#000"
              />
              <circle
                cx="200"
                cy="300"
                r="120"
                fill="#fff"
                stroke="#000"
                stroke-width="50"
              />
            </g>

            <g class="bubble-group hidden">
              <circle class="bubble bubble-1"
                cx="170"
                cy="310"
                r="7"
              />
              <circle class="bubble bubble-2"
                cx="200"
                cy="280"
                r="7"
              />
              <circle class="bubble bubble-3"
                cx="230"
                cy="330"
                r="7"
              />
            </g>

            <g transform="translate(130 235)">
              <g class="heat-group hidden" transform="scale(0.66)">
                <path class="heat-wave"
                      d="M 60 160
                         C 80 140, 80 120, 60 100
                         C 40 80, 40 60, 60 40"
                />
                <path class="heat-wave"
                      d="M 100 160
                         C 120 140, 120 120, 100 100
                         C 80 80, 80 60, 100 40"
                />
                <path class="heat-wave"
                      d="M 140 160
                         C 160 140, 160 120, 140 100
                         C 120 80, 120 60, 140 40"
                />
              </g>
            </g>

            <g transform="translate(0 50)">
              <g class="swirl-group hidden">
                <circle class="arc outer left"
                  cx="200"
                  cy="250"
                  r="83"
                />
                <circle class="arc outer right"
                  cx="200"
                  cy="250"
                  r="83"
                />
                <circle class="arc inner left"
                  cx="200"
                  cy="250"
                  r="60"
                />
                <circle class="arc inner right"
                  cx="200"
                  cy="250"
                  r="60"
                />
              </g>
            </g>

            <text class="remaining-time"
                  x="210"
                  y="95">
              --:--
            </text>
            <text class="job-state-text"
                  x="195"
                  y="135">
            </text>

          </svg>

        </div>
      </ha-card>
    `;

    //Save the reference to the selector so that it can be called later
    this._jobText = this.shadowRoot.querySelector(".job-state-text");
    this._timerText = this.shadowRoot.querySelector(".remaining-time");

    this._swirlGroup = this.shadowRoot.querySelector(".swirl-group");

    this._bubbleGroup = this.shadowRoot.querySelector(".bubble-group");
    this._bubble1 = this.shadowRoot.querySelector(".bubble-1");
    this._bubble2 = this.shadowRoot.querySelector(".bubble-2");
    this._bubble3 = this.shadowRoot.querySelector(".bubble-3");

    this._heatGroup = this.shadowRoot.querySelector(".heat-group");
  }


  // The height of your card. Home Assistant uses this to automatically
  // distribute all cards over the available columns in masonry view
  /*
  getCardSize() {
    return 3;
  }

  // The rules for sizing your card in the grid in sections view
  getGridOptions() {
    return {
      rows: 3,
      columns: 6,
      min_rows: 3,
      max_rows: 3
    };
  }
  */
  //return { rows: 'auto', min_columns: 6 };

  disconnectedCallback() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = undefined;
    }
  }
}

customElements.define(
  "washer-dryer-card",
  WasherDryerCard
);

window.customCards = window.customCards || [];

window.customCards.push({
  type: "washer-dryer-card",
  name: "Washer Dryer Card",
  description: "A custom card for washing machines and tumble dryers.",
});

console.info(`%c WASHER-DRYER-CARD %c v1.0.0`, "color: black; background: white; font-weight: 700;", "color: white; background: black; font-weight: 700;");
