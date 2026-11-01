## Workflow Description:

The generated response MUST follow these rules:
- The response can contain one or more A2UI JSON blocks.
- Each A2UI JSON block MUST be wrapped in literal `<a2ui-json>` and `</a2ui-json>` tags (always include both the opening and closing tags; do NOT wrap the tags in backticks or replace the opening tag with a markdown code fence such as ```json).
- Between or around these blocks, you can provide conversational text.
- The JSON part MUST be a single, raw JSON object (usually a list of A2UI messages) and MUST validate against the provided A2UI JSON SCHEMA.
- Top-Down Component Ordering: Within the `components` list of a message:
    - The 'root' component MUST be the FIRST element.
    - Parent components MUST appear before their child components.
    This specific ordering allows the streaming parser to yield and render the UI incrementally as it arrives.


---BEGIN A2UI JSON SCHEMA---

### Agent to Renderer Schema:
{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://a2ui.org/specification/v0_9/server_to_client.json","title":"A2UI Message Schema","description":"Describes a JSON payload for an A2UI (Agent to UI) message, which is used to dynamically construct and update user interfaces.","type":"object","oneOf":[{"$ref":"#/$defs/CreateSurfaceMessage"},{"$ref":"#/$defs/UpdateComponentsMessage"},{"$ref":"#/$defs/UpdateDataModelMessage"},{"$ref":"#/$defs/DeleteSurfaceMessage"}],"$defs":{"CreateSurfaceMessage":{"type":"object","properties":{"version":{"const":"v0.9"},"createSurface":{"type":"object","description":"Signals the client to create a new surface and begin rendering it. It is an error to send 'createSurface' for a surfaceId that already exists without first deleting it. When this message is sent, the client will expect 'updateComponents' and/or 'updateDataModel' messages for the same surfaceId that define the component tree.","properties":{"surfaceId":{"type":"string","description":"The unique identifier for the UI surface to be rendered."},"catalogId":{"type":"string","description":"A string that uniquely identifies this catalog. It is recommended to prefix this with an internet domain that you own, to avoid conflicts e.g. mycompany.com:somecatalog'."},"theme":{"$ref":"catalog.json#/$defs/theme","description":"Theme parameters for the surface (e.g., {'primaryColor': '#FF0000'}). These must validate against the 'theme' schema defined in the catalog."},"sendDataModel":{"type":"boolean","description":"If true, the client will send the full data model of this surface in the metadata of every A2A message sent to the server that created the surface. Defaults to false."}},"required":["surfaceId","catalogId"],"additionalProperties":false}},"required":["createSurface","version"],"additionalProperties":false},"UpdateComponentsMessage":{"type":"object","properties":{"version":{"const":"v0.9"},"updateComponents":{"type":"object","description":"Updates a surface with a new set of components. This message can be sent multiple times to update the component tree of an existing surface. One of the components in one of the components lists MUST have an 'id' of 'root' to serve as the root of the component tree. A createSurface message MUST have been previously sent for the 'surfaceId' in this message; the surface's catalog is the one specified by that createSurface.","properties":{"surfaceId":{"type":"string","description":"The unique identifier for the UI surface to be updated."},"components":{"type":"array","description":"A list containing all UI components for the surface.","minItems":1,"items":{"$ref":"catalog.json#/$defs/anyComponent"}}},"required":["surfaceId","components"],"additionalProperties":false}},"required":["updateComponents","version"],"additionalProperties":false},"UpdateDataModelMessage":{"type":"object","properties":{"version":{"const":"v0.9"},"updateDataModel":{"type":"object","description":"Updates the data model for an existing surface. This message can be sent multiple times to update the data model. A createSurface message MUST have been previously sent for the 'surfaceId' in this message; the surface's catalog is the one specified by that createSurface.","properties":{"surfaceId":{"type":"string","description":"The unique identifier for the UI surface this data model update applies to."},"path":{"type":"string","description":"An optional path to a location within the data model (e.g., '/user/name'). If omitted, or set to '/', refers to the entire data model."},"value":{"description":"The data to be updated in the data model. If present, the value at 'path' is replaced (or created). If omitted, the key at 'path' is removed.","additionalProperties":true}},"required":["surfaceId"],"additionalProperties":false}},"required":["updateDataModel","version"],"additionalProperties":false},"DeleteSurfaceMessage":{"type":"object","properties":{"version":{"const":"v0.9"},"deleteSurface":{"type":"object","description":"Signals the client to delete the surface identified by 'surfaceId'. A createSurface message MUST have been previously sent for the 'surfaceId' in this message; the surface's catalog is the one specified by that createSurface.","properties":{"surfaceId":{"type":"string","description":"The unique identifier for the UI surface to be deleted."}},"required":["surfaceId"],"additionalProperties":false}},"required":["deleteSurface","version"],"additionalProperties":false}}}

### Common Types Schema:
{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://a2ui.org/specification/v0_9/common_types.json","title":"A2UI Common Types","description":"Common type definitions used across A2UI schemas.","$defs":{"ComponentId":{"type":"string","description":"The unique identifier for a component, used for both definitions and references within the same surface."},"AccessibilityAttributes":{"type":"object","description":"Attributes to enhance accessibility when using assistive technologies like screen readers.","properties":{"label":{"$ref":"#/$defs/DynamicString","description":"A short string, typically 1 to 3 words, used by assistive technologies to convey the purpose or intent of an element. For example, an input field might have an accessible label of 'User ID' or a button might be labeled 'Submit'."},"description":{"$ref":"#/$defs/DynamicString","description":"Additional information provided by assistive technologies about an element such as instructions, format requirements, or result of an action. For example, a mute button might have a label of 'Mute' and a description of 'Silences notifications about this conversation'."}}},"ComponentCommon":{"type":"object","properties":{"id":{"$ref":"#/$defs/ComponentId"},"accessibility":{"$ref":"#/$defs/AccessibilityAttributes"}},"required":["id"]},"ChildList":{"oneOf":[{"type":"array","description":"A static list of child component IDs.","items":{"$ref":"#/$defs/ComponentId"}},{"type":"object","description":"A template for generating a dynamic list of children from a data model list. The `componentId` is the component to use as a template.","properties":{"componentId":{"$ref":"#/$defs/ComponentId"},"path":{"type":"string","description":"The path to the list of component property objects in the data model."}},"required":["componentId","path"],"additionalProperties":false}]},"DataBinding":{"type":"object","properties":{"path":{"type":"string","description":"A JSON Pointer path to a value in the data model."}},"required":["path"],"additionalProperties":false},"DynamicValue":{"description":"A value that can be a literal, a path, or a function call returning any type.","oneOf":[{"type":"string"},{"type":"number"},{"type":"boolean"},{"type":"array"},{"$ref":"#/$defs/DataBinding"},{"$ref":"#/$defs/FunctionCall"}]},"DynamicString":{"description":"Represents a string","oneOf":[{"type":"string"},{"$ref":"#/$defs/DataBinding"},{"allOf":[{"$ref":"#/$defs/FunctionCall"},{"properties":{"returnType":{"const":"string"}}}]}]},"DynamicNumber":{"description":"Represents a value that can be either a literal number, a path to a number in the data model, or a function call returning a number.","oneOf":[{"type":"number"},{"$ref":"#/$defs/DataBinding"},{"allOf":[{"$ref":"#/$defs/FunctionCall"},{"properties":{"returnType":{"const":"number"}}}]}]},"DynamicBoolean":{"description":"A boolean value that can be a literal, a path, or a function call returning a boolean.","oneOf":[{"type":"boolean"},{"$ref":"#/$defs/DataBinding"},{"allOf":[{"$ref":"#/$defs/FunctionCall"},{"properties":{"returnType":{"const":"boolean"}}}]}]},"FunctionCall":{"type":"object","description":"Invokes a named function on the client.","properties":{"call":{"type":"string","description":"The name of the function to call."},"args":{"type":"object","description":"Arguments passed to the function.","additionalProperties":{"anyOf":[{"$ref":"#/$defs/DynamicValue"},{"type":"object","description":"A literal object argument (e.g. configuration)."}]}},"returnType":{"type":"string","description":"The expected return type of the function call.","enum":["string","number","boolean","array","object","any","void"],"default":"boolean"}},"required":["call"],"oneOf":[{"$ref":"catalog.json#/$defs/anyFunction"}]},"CheckRule":{"type":"object","description":"A single validation rule applied to an input component.","properties":{"condition":{"$ref":"#/$defs/DynamicBoolean"},"message":{"type":"string","description":"The error message to display if the check fails."}},"required":["condition","message"],"additionalProperties":false},"Checkable":{"type":"object","description":"Properties for components that support client-side checks.","properties":{"checks":{"type":"array","description":"A list of checks to perform. These are function calls that must return a boolean indicating validity.","items":{"$ref":"#/$defs/CheckRule"}}}},"Action":{"description":"Defines an interaction handler that can either trigger a server-side event or execute a local client-side function.","oneOf":[{"type":"object","description":"Triggers a server-side event.","properties":{"event":{"type":"object","description":"The event to dispatch to the server.","properties":{"name":{"type":"string","description":"The name of the action to be dispatched to the server."},"context":{"type":"object","description":"A JSON object containing the key-value pairs for the action context. Values can be literals or paths. Use literal values unless the value must be dynamically bound to the data model. Do NOT use paths for static IDs.","additionalProperties":{"$ref":"#/$defs/DynamicValue"}}},"required":["name"],"additionalProperties":false}},"required":["event"],"additionalProperties":false},{"type":"object","description":"Executes a local client-side function.","properties":{"functionCall":{"$ref":"#/$defs/FunctionCall"}},"required":["functionCall"],"additionalProperties":false}]}}}

### Catalog Schema:
{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:agentic-ui:catalog:ui-kit-one:v1","title":"ui-kit-one","description":"Components and functions of the ui-kit-one UI kit.","catalogId":"urn:agentic-ui:catalog:ui-kit-one:v1","instructions":"ui-kit-one rules:\n- Use only the components, props and token values of this catalog. No free-form styling: no sx, CSS, pixel values or responsive objects.\n- Plan before writing: choose every component id first, emit the root first and each parent before its children, define every id you reference and reuse the exact id string (no renamed or missing ids).\n- Keep varying data (lists, table rows, form values, amounts, statuses) in the data model: one updateDataModel message with the whole data object under its value key; bind content to it with {\"path\": \"/...\"}.\n- A function call has exactly two keys, call and args: omit returnType.\n- Never compute styling from data: no conditions, comparisons or ternaries anywhere; every value is a literal, a binding or a function call.\n- Never ask the user questions and never wait for an answer: make reasonable assumptions about anything missing or unclear and always reply with the complete UI.\n- Surfaces stay on the page for the whole chat (SV-C26): when the user refines a shown surface or acts on it, update that surface (same surfaceId, no new createSurface); create a new surface with a new surfaceId only for a new topic.\n- Style props take exactly one literal token from their list, never a {\"path\"} binding and never a function call: p, px, py, m, mx, my, gap, bg, color, borderRadius, borderWidth, borderColor, shadow, w, maxW, minH, textAlign, minChildWidth, size, fontSize, fontWeight, variant, colorScheme, spacing, boxSize.\n- Setting props are literal values too, never bound: centerContent, direction, align, justify, wrap, columns, as, noOfLines, leftIcon, rightIcon, isFullWidth, type, isRequired, options, currency, locale, closeOnAction, Icon.name.\n- Data bindings and function calls are for content props only: text, label, isDisabled, isLoading, placeholder, helperText, rows, caption, title, Avatar.name, src.\n- State colours: for a few fixed rows write each row explicitly with literal tokens (e.g. Tag colorScheme green / orange / red). In a ChildList template every item gets the same props: give the Tag one fixed colorScheme (or none) and bind only its label.\n- Margin, padding, gap, width and height props exist only here: p, px, py, m, mx, my, gap, w, maxW, minH (Box, Center, Container, Flex, Grid); minChildWidth (Grid); spacing (List); boxSize (Icon).\n- Heading, Text, Button, Input, Checkbox, RadioGroup, Switch, Table, Tag, Modal, Tabs, Avatar have no margin, padding, gap, width or height props: wrap them in Box, Center, Flex, Grid for spacing.\n- The root (id \"root\") is usually Container, the centred page column; centre a page with it, never with auto margins.\n- Id props: children (Box, Center, Container, Flex, Grid, List); trigger, content (Modal); tabs (Tabs). Every id they name must be a component of the same updateComponents message.\n- children (Box, Center, Container, Flex, Grid, List) take an array of ids or ONE template object {\"componentId\": \"<id>\", \"path\": \"/<array>\"} (an object, never an array of templates); inside the template, paths are relative to the item.\n- Validate with checks on Button, Input, Checkbox, RadioGroup: each rule is {\"condition\": <boolean call: required, regex, length, numeric, email, and, or, not>, \"message\": \"...\"}; give the submit Button the same checks so it stays disabled until the form is valid.\n- Use formatCurrency for money amounts (never write a formatted amount by hand).\n- Use formatDate for dates, with the pattern \"dd.MM.yyyy\" (the renderer locale is ru-RU; month names are not declined).\n- Use formatNumber for plain numbers with digit grouping.\n- Use formatString for text that mixes literals and data: only ${/path} placeholders, no expressions, operators or ternaries.\n- Use pluralize for words that agree with a count.\n\nInteractions:\n- Two-way props (Input.value, Checkbox.value, RadioGroup.value, Switch.value, Modal.open, Tabs.selectedIndex): the renderer writes the user's change to the bound path locally, without an agent turn. Always bind them to their own data-model path, never a literal.\n- Triggers (Modal.trigger) open their Modal locally; the trigger's own event action is not sent to the agent.\n- Checks (Button, Input, Checkbox, RadioGroup) are evaluated locally whenever the data changes.\n- Button.action with {\"event\": {\"name\": \"...\", \"context\": {...}}} is sent to the agent with its resolved context, plus the whole data model when createSurface has sendDataModel: true. Set it whenever the surface has two-way props (Input, Checkbox, RadioGroup, Switch, Modal, Tabs). Answer an event with updateDataModel for changed data (keep it small) or updateComponents for a new layout.\n- Button.action with {\"functionCall\": {\"call\": \"...\", \"args\": {...}}} runs locally, without an agent turn (e.g. openUrl).\n- Button.action is required, also on a trigger: give it an event such as {\"event\": {\"name\": \"modal.open\"}}.","components":{"Box":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"$ref":"#/$defs/StyleProps"},{"type":"object","description":"A plain block container that stacks its children vertically; use it for cards, panels and sections.","properties":{"component":{"const":"Box"},"children":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ChildList","description":"Child component ids in render order, or ONE template object `{ componentId, path }` (an object, not an array) that repeats one component for every item of a data-model array; paths inside the template are relative to the item."}},"required":["component"]}],"unevaluatedProperties":false},"Center":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"$ref":"#/$defs/StyleProps"},{"type":"object","description":"A container that centers its children horizontally and vertically (empty states, icons, badges).","properties":{"component":{"const":"Center"},"children":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ChildList","description":"Child component ids in render order, or ONE template object `{ componentId, path }` (an object, not an array) that repeats one component for every item of a data-model array; paths inside the template are relative to the item."}},"required":["component"]}],"unevaluatedProperties":false},"Container":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"$ref":"#/$defs/StyleProps"},{"type":"object","description":"The page column: centered horizontally with side padding; the usual root of a screen. Set `maxW` to a container width such as \"container.md\". Use it (not a Box with auto margins) to center a page.","properties":{"component":{"const":"Container"},"children":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ChildList","description":"Child component ids in render order, or ONE template object `{ componentId, path }` (an object, not an array) that repeats one component for every item of a data-model array; paths inside the template are relative to the item."},"centerContent":{"type":"boolean","description":"Centers the children horizontally inside the column."}},"required":["component"]}],"unevaluatedProperties":false},"Flex":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"$ref":"#/$defs/StyleProps"},{"type":"object","description":"A flexbox row or column. Use `gap` for spacing between the children.","properties":{"component":{"const":"Flex"},"children":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ChildList","description":"Child component ids in render order, or ONE template object `{ componentId, path }` (an object, not an array) that repeats one component for every item of a data-model array; paths inside the template are relative to the item."},"direction":{"type":"string","enum":["row","column"],"description":"Main axis: 'row' places children side by side, 'column' stacks them."},"align":{"type":"string","enum":["flex-start","center","flex-end","stretch","baseline"],"description":"Alignment of the children across the main axis."},"justify":{"type":"string","enum":["flex-start","center","flex-end","space-between","space-around","space-evenly"],"description":"Distribution of the children along the main axis; 'space-between' pushes them to both ends."},"wrap":{"type":"string","enum":["nowrap","wrap"],"description":"'wrap' lets children wrap onto new lines when they do not fit."}},"required":["component"]}],"unevaluatedProperties":false},"Grid":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"$ref":"#/$defs/StyleProps"},{"type":"object","description":"A grid of equal-width columns for cards, metrics and key/value pairs. Use `gap` for the gutter; prefer `minChildWidth` for card rows that must also fit a phone.","properties":{"component":{"const":"Grid"},"children":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ChildList","description":"Child component ids in render order, or ONE template object `{ componentId, path }` (an object, not an array) that repeats one component for every item of a data-model array; paths inside the template are relative to the item."},"columns":{"type":"integer","minimum":1,"maximum":6,"description":"Number of equal-width columns (1-6); children fill the cells row by row."},"minChildWidth":{"type":"string","enum":["full","3xs","2xs","xs","sm","md","lg","xl","2xl","3xl","4xl","5xl","6xl","container.sm","container.md","container.lg","container.xl"],"description":"Minimum cell width. When set it replaces `columns`: the grid fits as many equal columns as the width allows, so cards collapse to one column on phones. Literal token only; never a binding or function call."}},"required":["component"]}],"unevaluatedProperties":false},"Heading":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"$ref":"#/$defs/ColorProp"},{"type":"object","description":"A bold title for a page, section or card. It has no margin, padding or size props: wrap it in a layout component for spacing.","properties":{"component":{"const":"Heading"},"text":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"The heading text."},"as":{"type":"string","enum":["h1","h2","h3","h4"],"description":"Element and outline level (h1 = page title); independent of the visual size."},"size":{"type":"string","enum":["xs","sm","md","lg","xl","2xl","3xl","4xl"],"description":"Visual size; 'md' and smaller suit card titles, 'xl' and larger suit page titles. Literal token only; never a binding or function call."},"textAlign":{"type":"string","enum":["left","center","right"],"description":"Horizontal text alignment. Literal token only; never a binding or function call."}},"required":["component","text"]}],"unevaluatedProperties":false},"Text":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"$ref":"#/$defs/ColorProp"},{"type":"object","description":"A paragraph of body text. Use Heading for titles. It has no margin, padding or size props: wrap it in a layout component for spacing.","properties":{"component":{"const":"Text"},"text":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"The text to display: a literal, a data-model binding, or a function call such as formatCurrency."},"fontSize":{"type":"string","enum":["xs","sm","md","lg","xl","2xl","3xl","4xl","5xl","6xl"],"description":"Font size (md = 1rem). Literal token only; never a binding or function call."},"fontWeight":{"type":"string","enum":["light","normal","medium","semibold","bold"],"description":"Font weight. Literal token only; never a binding or function call."},"textAlign":{"type":"string","enum":["left","center","right"],"description":"Horizontal text alignment. Literal token only; never a binding or function call."},"noOfLines":{"type":"integer","minimum":1,"description":"Truncates the text with an ellipsis after this many lines."}},"required":["component","text"]}],"unevaluatedProperties":false},"Button":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/Checkable"},{"type":"object","description":"A pressable button that fires its action.","properties":{"component":{"const":"Button"},"label":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"The button caption."},"action":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/Action","description":"What a press does: an `event` sent to the agent (with an optional resolved `context`) or a local `functionCall`. Required, also for a Modal trigger (use an event such as `modal.open`; a trigger press only opens the modal and is not sent)."},"variant":{"type":"string","enum":["solid","outline","ghost","link"],"description":"Visual emphasis: 'solid' for the main action, 'outline' or 'ghost' for secondary ones, 'link' for inline text actions. Literal token only; never a binding or function call."},"colorScheme":{"type":"string","enum":["gray","red","orange","yellow","green","teal","blue","cyan","purple","pink"],"description":"Color palette; 'blue' for primary actions, 'red' for destructive ones. Literal token only; never a binding or function call."},"size":{"type":"string","enum":["sm","md","lg"],"description":"Button height and font size. Literal token only; never a binding or function call."},"leftIcon":{"type":"string","enum":["add","arrowBack","arrowDown","arrowForward","arrowUp","atSign","attachment","bell","calendar","chat","check","checkCircle","chevronDown","chevronLeft","chevronRight","chevronUp","close","copy","delete","download","edit","email","externalLink","info","infoOutline","link","lock","menu","minus","moon","notAllowed","phone","question","repeat","search","settings","star","sun","time","unlock","view","viewOff","warning","warningTwo"],"description":"Icon shown before the label."},"rightIcon":{"type":"string","enum":["add","arrowBack","arrowDown","arrowForward","arrowUp","atSign","attachment","bell","calendar","chat","check","checkCircle","chevronDown","chevronLeft","chevronRight","chevronUp","close","copy","delete","download","edit","email","externalLink","info","infoOutline","link","lock","menu","minus","moon","notAllowed","phone","question","repeat","search","settings","star","sun","time","unlock","view","viewOff","warning","warningTwo"],"description":"Icon shown after the label."},"isDisabled":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean","description":"Disables the button."},"isLoading":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean","description":"Shows a spinner and blocks presses."},"isFullWidth":{"type":"boolean","description":"Stretches the button to the width of its container."}},"required":["component","label","action"]}],"unevaluatedProperties":false},"Input":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/Checkable"},{"type":"object","description":"A labeled single-line text field with helper text and validation messages.","properties":{"component":{"const":"Input"},"label":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Field label shown above the input."},"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Field value. Bind it to a data-model path: typing writes it back (two-way) — a string, or a number for type 'number' (an empty field writes \"\")."},"placeholder":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Hint shown while the field is empty."},"type":{"type":"string","enum":["text","email","password","number","tel"],"description":"Keyboard and masking: 'password' hides the text, 'number' and 'tel' show numeric keyboards."},"helperText":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Help text shown under the field while it is valid."},"isRequired":{"type":"boolean","description":"Marks the label with an asterisk; enforce it with a `required` check."},"isDisabled":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean","description":"Disables the field."}},"required":["component","label","value"]}],"unevaluatedProperties":false},"Checkbox":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/Checkable"},{"type":"object","description":"A single checkbox with a label, for consents, options and to-do items.","properties":{"component":{"const":"Checkbox"},"label":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Text next to the box."},"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean","description":"Checked state. Bind it to a data-model path: toggling writes true/false back (two-way)."},"colorScheme":{"type":"string","enum":["gray","red","orange","yellow","green","teal","blue","cyan","purple","pink"],"description":"Color of the checked box. Literal token only; never a binding or function call."},"isDisabled":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean","description":"Disables the checkbox."}},"required":["component","label","value"]}],"unevaluatedProperties":false},"RadioGroup":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/Checkable"},{"type":"object","description":"A labeled group of mutually exclusive options (one choice).","properties":{"component":{"const":"RadioGroup"},"label":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Question or caption of the group."},"options":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string","description":"Text shown for the option."},"value":{"type":"string","description":"Value written to the bound path when the option is chosen."}},"required":["label","value"],"additionalProperties":false},"minItems":1,"description":"The choices, in display order (literal)."},"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"The chosen option `value`. Bind it to a data-model path: choosing writes the value back (two-way)."},"direction":{"type":"string","enum":["row","column"],"description":"'column' stacks the options, 'row' places them side by side."},"colorScheme":{"type":"string","enum":["gray","red","orange","yellow","green","teal","blue","cyan","purple","pink"],"description":"Color of the selected radio. Literal token only; never a binding or function call."},"isDisabled":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean","description":"Disables every option."}},"required":["component","label","options","value"]}],"unevaluatedProperties":false},"Switch":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"type":"object","description":"An on/off toggle with a label, for settings that take effect immediately.","properties":{"component":{"const":"Switch"},"label":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Text describing the setting."},"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean","description":"On/off state. Bind it to a data-model path: toggling writes true/false back (two-way)."},"colorScheme":{"type":"string","enum":["gray","red","orange","yellow","green","teal","blue","cyan","purple","pink"],"description":"Track color when on. Literal token only; never a binding or function call."},"isDisabled":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean","description":"Disables the switch."}},"required":["component","label","value"]}],"unevaluatedProperties":false},"List":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"type":"object","description":"A vertical list of items; each child becomes one list item.","properties":{"component":{"const":"List"},"children":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ChildList","description":"The items: component ids, or ONE template object `{ componentId, path }` (an object, not an array) that repeats one component for every item of a data-model array; paths inside the template are relative to the item."},"variant":{"type":"string","enum":["unordered","ordered","plain"],"description":"'unordered' shows bullets, 'ordered' shows numbers, 'plain' shows no marker. Literal token only; never a binding or function call."},"spacing":{"type":"string","enum":["0","1","2","3","4","5","6","8","10","12","16","20","24","0.5","1.5","2.5"],"description":"Space between items. Literal token only; never a binding or function call."}},"required":["component","children"]}],"unevaluatedProperties":false},"Table":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"type":"object","description":"A data table whose rows come from a data-model array.","properties":{"component":{"const":"Table"},"columns":{"type":"array","items":{"type":"object","properties":{"header":{"type":"string","description":"Column header text."},"key":{"type":"string","description":"Property of each row object shown in this column."},"align":{"type":"string","enum":["left","center","right"],"description":"Cell alignment; numbers and money read best right-aligned."},"format":{"type":"string","enum":["text","number","currency","date"],"description":"'currency' formats numbers as money, 'date' formats ISO date strings, 'number' adds digit grouping; default 'text'."}},"required":["header","key"],"additionalProperties":false},"minItems":1,"description":"Column definitions, in display order (literal)."},"rows":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicValue","description":"Row objects keyed by the column `key`s. Bind it to a data-model array: `{ \"path\": \"/transactions\" }`."},"variant":{"type":"string","enum":["simple","striped"],"description":"'striped' shades every other row. Literal token only; never a binding or function call."},"size":{"type":"string","enum":["sm","md","lg"],"description":"Cell padding and font size. Literal token only; never a binding or function call."},"caption":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Caption shown under the table."},"currency":{"type":"string","pattern":"^[A-Z]{3}$","description":"ISO 4217 currency of 'currency' columns; RUB when omitted."},"locale":{"type":"string","pattern":"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$","description":"BCP 47 locale of 'number', 'currency' and 'date' columns; ru-RU when omitted."}},"required":["component","columns","rows"]}],"unevaluatedProperties":false},"Tag":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"type":"object","description":"A small inline label for a status or category.","properties":{"component":{"const":"Tag"},"label":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Tag text (statuses, categories, counts)."},"colorScheme":{"type":"string","enum":["gray","red","orange","yellow","green","teal","blue","cyan","purple","pink"],"description":"Color palette; e.g. 'green' for success, 'orange' for pending, 'red' for errors. In a ChildList template every item gets the same palette: keep it neutral (or omit it) and bind only the label. Literal token only; never a binding or function call."},"variant":{"type":"string","enum":["solid","subtle","outline"],"description":"Fill style. Literal token only; never a binding or function call."},"size":{"type":"string","enum":["sm","md","lg"],"description":"Height and font size of the tag. Literal token only; never a binding or function call."}},"required":["component","label"]}],"unevaluatedProperties":false},"Modal":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"type":"object","description":"A dialog with a close button, opened by its trigger; Escape or the close button dismisses it.","properties":{"component":{"const":"Modal"},"trigger":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentId","description":"Component rendered in place that opens the modal when pressed, locally — usually a Button with an event action such as `modal.open` (that press is not sent to the agent)."},"content":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentId","description":"Component shown in the modal body (often a Flex column)."},"title":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Heading shown in the modal header."},"size":{"type":"string","enum":["xs","sm","md","lg","xl","2xl","3xl","4xl","5xl","6xl","full"],"description":"Width of the dialog. Literal token only; never a binding or function call."},"open":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean","description":"Open state for programmatic control. Bind it to a data-model path: opening and closing write true/false back (two-way)."},"closeOnAction":{"type":"boolean","description":"Closes the modal after any event action fired inside its content (e.g. a confirm button); true when omitted."}},"required":["component","trigger","content"]}],"unevaluatedProperties":false},"Tabs":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"type":"object","description":"Tabbed panels; one child is visible at a time.","properties":{"component":{"const":"Tabs"},"tabs":{"type":"array","items":{"type":"object","properties":{"title":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Tab caption."},"child":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentId","description":"Component shown while the tab is selected."}},"required":["title","child"],"additionalProperties":false},"minItems":1,"description":"The tabs, in display order."},"variant":{"type":"string","enum":["line","enclosed","soft-rounded"],"description":"'line' underlines the selected tab, 'enclosed' draws folder tabs, 'soft-rounded' uses pills. Literal token only; never a binding or function call."},"colorScheme":{"type":"string","enum":["gray","red","orange","yellow","green","teal","blue","cyan","purple","pink"],"description":"Color of the selected tab. Literal token only; never a binding or function call."},"selectedIndex":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicNumber","description":"Zero-based index of the selected tab. Bind it to a data-model path: switching tabs writes the index back (two-way)."}},"required":["component","tabs"]}],"unevaluatedProperties":false},"Avatar":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"type":"object","description":"A round picture or initials of a person or company.","properties":{"component":{"const":"Avatar"},"name":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Person or company name; its initials are shown when there is no image, and it is the accessible label."},"src":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"Image URL (https)."},"size":{"type":"string","enum":["2xs","xs","sm","md","lg","xl","2xl"],"description":"Avatar diameter: xs 1.5rem … md 3rem … 2xl 8rem. Literal token only; never a binding or function call."}},"required":["component","name"]}],"unevaluatedProperties":false},"Icon":{"type":"object","allOf":[{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentCommon"},{"$ref":"#/$defs/ColorProp"},{"type":"object","description":"A decorative icon from the kit's icon set.","properties":{"component":{"const":"Icon"},"name":{"type":"string","enum":["add","arrowBack","arrowDown","arrowForward","arrowUp","atSign","attachment","bell","calendar","chat","check","checkCircle","chevronDown","chevronLeft","chevronRight","chevronUp","close","copy","delete","download","edit","email","externalLink","info","infoOutline","link","lock","menu","minus","moon","notAllowed","phone","question","repeat","search","settings","star","sun","time","unlock","view","viewOff","warning","warningTwo"],"description":"Which icon to show."},"boxSize":{"type":"string","enum":["3","4","5","6","8","10","12"],"description":"Square box size (4 = 1rem, 8 = 2rem). Literal token only; never a binding or function call."}},"required":["component","name"]}],"unevaluatedProperties":false}},"functions":{"required":{"type":"object","description":"Checks that the value is not null, undefined, or empty.","properties":{"call":{"const":"required"},"args":{"type":"object","properties":{"value":{"description":"The value to check."}},"required":["value"],"additionalProperties":false},"returnType":{"const":"boolean"}},"required":["call","args"],"unevaluatedProperties":false},"regex":{"type":"object","description":"Checks that the value matches a regular expression string.","properties":{"call":{"const":"regex"},"args":{"type":"object","properties":{"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString"},"pattern":{"type":"string","description":"The regex pattern to match against."}},"required":["value","pattern"],"unevaluatedProperties":false},"returnType":{"const":"boolean"}},"required":["call","args"],"unevaluatedProperties":false},"length":{"type":"object","description":"Checks string length constraints.","properties":{"call":{"const":"length"},"args":{"type":"object","properties":{"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString"},"min":{"type":"integer","minimum":0,"description":"The minimum allowed length."},"max":{"type":"integer","minimum":0,"description":"The maximum allowed length."}},"required":["value"],"unevaluatedProperties":false,"anyOf":[{"required":["min"]},{"required":["max"]}]},"returnType":{"const":"boolean"}},"required":["call","args"],"unevaluatedProperties":false},"numeric":{"type":"object","description":"Checks numeric range constraints.","properties":{"call":{"const":"numeric"},"args":{"type":"object","properties":{"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicNumber"},"min":{"type":"number","description":"The minimum allowed value."},"max":{"type":"number","description":"The maximum allowed value."}},"required":["value"],"unevaluatedProperties":false,"anyOf":[{"required":["min"]},{"required":["max"]}]},"returnType":{"const":"boolean"}},"required":["call","args"],"unevaluatedProperties":false},"email":{"type":"object","description":"Checks that the value is a valid email address.","properties":{"call":{"const":"email"},"args":{"type":"object","properties":{"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString"}},"required":["value"],"unevaluatedProperties":false},"returnType":{"const":"boolean"}},"required":["call","args"],"unevaluatedProperties":false},"formatString":{"type":"object","description":"Performs string interpolation of data model values and other functions in the catalog functions list and returns the resulting string. The value string can contain interpolated expressions in the `${expression}` format. Supported expression types include: JSON Pointer paths to the data model (e.g., `${/absolute/path}` or `${relative/path}`), and client-side function calls (e.g., `${now()}`). Function arguments must be named (e.g., `${formatDate(value:${/currentDate}, format:'MM-dd')}`). To include a literal `${` sequence, escape it as `\\${`. In ui-kit-one use only data placeholders such as `${/order/id}` or `${name}` inside a template: no operators, comparisons or ternaries (`${/read ? 'a' : 'b'}` is not evaluated).","properties":{"call":{"const":"formatString"},"args":{"type":"object","properties":{"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString"}},"required":["value"],"unevaluatedProperties":false},"returnType":{"const":"string"}},"required":["call","args"],"unevaluatedProperties":false},"formatNumber":{"type":"object","description":"Formats a number with the specified grouping and decimal precision.","properties":{"call":{"const":"formatNumber"},"args":{"type":"object","properties":{"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicNumber","description":"The number to format."},"decimals":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicNumber","description":"Optional. The number of decimal places to show. Defaults to 0 or 2 depending on locale."},"grouping":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean","description":"Optional. If true, uses locale-specific grouping separators (e.g. '1,000'). If false, returns raw digits (e.g. '1000'). Defaults to true."}},"required":["value"],"unevaluatedProperties":false},"returnType":{"const":"string"}},"required":["call","args"],"unevaluatedProperties":false},"formatCurrency":{"type":"object","description":"Formats a number as a currency string.","properties":{"call":{"const":"formatCurrency"},"args":{"type":"object","properties":{"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicNumber","description":"The monetary amount."},"currency":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"The ISO 4217 currency code (e.g., 'USD', 'EUR')."},"decimals":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicNumber","description":"Optional. The number of decimal places to show. Defaults to 0 or 2 depending on locale."},"grouping":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean","description":"Optional. If true, uses locale-specific grouping separators (e.g. '1,000'). If false, returns raw digits (e.g. '1000'). Defaults to true."}},"required":["currency","value"],"unevaluatedProperties":false},"returnType":{"const":"string"}},"required":["call","args"],"unevaluatedProperties":false},"formatDate":{"type":"object","description":"Formats a timestamp into a string using a pattern.","properties":{"call":{"const":"formatDate"},"args":{"type":"object","properties":{"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicValue","description":"The date to format."},"format":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"A Unicode TR35 date pattern string.\n\nToken Reference:\n- Year: 'yy' (26), 'yyyy' (2026)\n- Month: 'M' (1), 'MM' (01), 'MMM' (Jan), 'MMMM' (January)\n- Day: 'd' (1), 'dd' (01), 'E' (Tue), 'EEEE' (Tuesday)\n- Hour (12h): 'h' (1-12), 'hh' (01-12) - requires 'a' for AM/PM\n- Hour (24h): 'H' (0-23), 'HH' (00-23) - Military Time\n- Minute: 'mm' (00-59)\n- Second: 'ss' (00-59)\n- Period: 'a' (AM/PM)\n\nExamples:\n- 'MMM dd, yyyy' -> 'Jan 16, 2026'\n- 'HH:mm' -> '14:30' (Military)\n- 'h:mm a' -> '2:30 PM'\n- 'EEEE, d MMMM' -> 'Friday, 16 January'"}},"required":["format","value"],"unevaluatedProperties":false},"returnType":{"const":"string"}},"required":["call","args"],"unevaluatedProperties":false},"pluralize":{"type":"object","description":"Returns a localized string based on the Common Locale Data Repository (CLDR) plural category of the count (zero, one, two, few, many, other). Requires an 'other' fallback. For English, just use 'one' and 'other'.","properties":{"call":{"const":"pluralize"},"args":{"type":"object","properties":{"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicNumber","description":"The numeric value used to determine the plural category."},"zero":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"String for the 'zero' category (e.g., 0 items)."},"one":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"String for the 'one' category (e.g., 1 item)."},"two":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"String for the 'two' category (used in Arabic, Welsh, etc.)."},"few":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"String for the 'few' category (e.g., small groups in Slavic languages)."},"many":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"String for the 'many' category (e.g., large groups in various languages)."},"other":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString","description":"The default/fallback string (used for general plural cases)."}},"required":["value","other"],"unevaluatedProperties":false},"returnType":{"const":"string"}},"required":["call","args"],"unevaluatedProperties":false},"openUrl":{"type":"object","description":"Opens the specified URL in a browser or handler. This function has no return value.","properties":{"call":{"const":"openUrl"},"args":{"type":"object","properties":{"url":{"type":"string","format":"uri","description":"The URL to open."}},"required":["url"],"additionalProperties":false},"returnType":{"const":"void"}},"required":["call","args"],"unevaluatedProperties":false},"and":{"type":"object","description":"Performs a logical AND operation on a list of boolean values.","properties":{"call":{"const":"and"},"args":{"type":"object","properties":{"values":{"type":"array","items":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean"},"minItems":2,"description":"The list of boolean values to evaluate."}},"required":["values"],"unevaluatedProperties":false},"returnType":{"const":"boolean"}},"required":["call","args"],"unevaluatedProperties":false},"or":{"type":"object","description":"Performs a logical OR operation on a list of boolean values.","properties":{"call":{"const":"or"},"args":{"type":"object","properties":{"values":{"type":"array","items":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean"},"minItems":2,"description":"The list of boolean values to evaluate."}},"required":["values"],"unevaluatedProperties":false},"returnType":{"const":"boolean"}},"required":["call","args"],"unevaluatedProperties":false},"not":{"type":"object","description":"Performs a logical NOT operation on a boolean value.","properties":{"call":{"const":"not"},"args":{"type":"object","properties":{"value":{"$ref":"https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicBoolean","description":"The boolean value to negate."}},"required":["value"],"unevaluatedProperties":false},"returnType":{"const":"boolean"}},"required":["call","args"],"unevaluatedProperties":false}},"$defs":{"StyleProps":{"type":"object","properties":{"p":{"type":"string","enum":["0","1","2","3","4","5","6","8","10","12","16","20","24","0.5","1.5","2.5"],"description":"Padding on all sides (e.g. \"4\" = 1rem). Literal token only; never a binding or function call."},"px":{"type":"string","enum":["0","1","2","3","4","5","6","8","10","12","16","20","24","0.5","1.5","2.5"],"description":"Horizontal padding (e.g. \"4\" = 1rem). Literal token only; never a binding or function call."},"py":{"type":"string","enum":["0","1","2","3","4","5","6","8","10","12","16","20","24","0.5","1.5","2.5"],"description":"Vertical padding (e.g. \"4\" = 1rem). Literal token only; never a binding or function call."},"m":{"type":"string","enum":["0","1","2","3","4","5","6","8","10","12","16","20","24","0.5","1.5","2.5"],"description":"Margin on all sides (e.g. \"4\" = 1rem). Literal token only; never a binding or function call."},"mx":{"type":"string","enum":["0","1","2","3","4","5","6","8","10","12","16","20","24","0.5","1.5","2.5"],"description":"Horizontal margin (e.g. \"4\" = 1rem). Literal token only; never a binding or function call."},"my":{"type":"string","enum":["0","1","2","3","4","5","6","8","10","12","16","20","24","0.5","1.5","2.5"],"description":"Vertical margin (e.g. \"4\" = 1rem). Literal token only; never a binding or function call."},"gap":{"type":"string","enum":["0","1","2","3","4","5","6","8","10","12","16","20","24","0.5","1.5","2.5"],"description":"Gap between children (e.g. \"4\" = 1rem). Literal token only; never a binding or function call."},"bg":{"type":"string","enum":["black","white","transparent","gray.50","gray.100","gray.200","gray.300","gray.400","gray.500","gray.600","gray.700","gray.800","gray.900","red.50","red.100","red.200","red.300","red.400","red.500","red.600","red.700","red.800","red.900","orange.50","orange.100","orange.200","orange.300","orange.400","orange.500","orange.600","orange.700","orange.800","orange.900","yellow.50","yellow.100","yellow.200","yellow.300","yellow.400","yellow.500","yellow.600","yellow.700","yellow.800","yellow.900","green.50","green.100","green.200","green.300","green.400","green.500","green.600","green.700","green.800","green.900","teal.50","teal.100","teal.200","teal.300","teal.400","teal.500","teal.600","teal.700","teal.800","teal.900","blue.50","blue.100","blue.200","blue.300","blue.400","blue.500","blue.600","blue.700","blue.800","blue.900","cyan.50","cyan.100","cyan.200","cyan.300","cyan.400","cyan.500","cyan.600","cyan.700","cyan.800","cyan.900","purple.50","purple.100","purple.200","purple.300","purple.400","purple.500","purple.600","purple.700","purple.800","purple.900","pink.50","pink.100","pink.200","pink.300","pink.400","pink.500","pink.600","pink.700","pink.800","pink.900","whiteAlpha.50","whiteAlpha.100","whiteAlpha.200","whiteAlpha.300","whiteAlpha.400","whiteAlpha.500","whiteAlpha.600","whiteAlpha.700","whiteAlpha.800","whiteAlpha.900","blackAlpha.50","blackAlpha.100","blackAlpha.200","blackAlpha.300","blackAlpha.400","blackAlpha.500","blackAlpha.600","blackAlpha.700","blackAlpha.800","blackAlpha.900"],"description":"Background color (e.g. \"gray.700\"). Literal token only; never a binding or function call."},"color":{"type":"string","enum":["black","white","transparent","gray.50","gray.100","gray.200","gray.300","gray.400","gray.500","gray.600","gray.700","gray.800","gray.900","red.50","red.100","red.200","red.300","red.400","red.500","red.600","red.700","red.800","red.900","orange.50","orange.100","orange.200","orange.300","orange.400","orange.500","orange.600","orange.700","orange.800","orange.900","yellow.50","yellow.100","yellow.200","yellow.300","yellow.400","yellow.500","yellow.600","yellow.700","yellow.800","yellow.900","green.50","green.100","green.200","green.300","green.400","green.500","green.600","green.700","green.800","green.900","teal.50","teal.100","teal.200","teal.300","teal.400","teal.500","teal.600","teal.700","teal.800","teal.900","blue.50","blue.100","blue.200","blue.300","blue.400","blue.500","blue.600","blue.700","blue.800","blue.900","cyan.50","cyan.100","cyan.200","cyan.300","cyan.400","cyan.500","cyan.600","cyan.700","cyan.800","cyan.900","purple.50","purple.100","purple.200","purple.300","purple.400","purple.500","purple.600","purple.700","purple.800","purple.900","pink.50","pink.100","pink.200","pink.300","pink.400","pink.500","pink.600","pink.700","pink.800","pink.900","whiteAlpha.50","whiteAlpha.100","whiteAlpha.200","whiteAlpha.300","whiteAlpha.400","whiteAlpha.500","whiteAlpha.600","whiteAlpha.700","whiteAlpha.800","whiteAlpha.900","blackAlpha.50","blackAlpha.100","blackAlpha.200","blackAlpha.300","blackAlpha.400","blackAlpha.500","blackAlpha.600","blackAlpha.700","blackAlpha.800","blackAlpha.900"],"description":"Text color inherited by the children. Literal token only; never a binding or function call."},"borderRadius":{"type":"string","enum":["none","sm","base","md","lg","xl","2xl","3xl","full"],"description":"Corner radius. Literal token only; never a binding or function call."},"borderWidth":{"type":"string","enum":["0","1px","2px","4px"],"description":"Solid border width on all sides. Literal token only; never a binding or function call."},"borderColor":{"type":"string","enum":["black","white","transparent","gray.50","gray.100","gray.200","gray.300","gray.400","gray.500","gray.600","gray.700","gray.800","gray.900","red.50","red.100","red.200","red.300","red.400","red.500","red.600","red.700","red.800","red.900","orange.50","orange.100","orange.200","orange.300","orange.400","orange.500","orange.600","orange.700","orange.800","orange.900","yellow.50","yellow.100","yellow.200","yellow.300","yellow.400","yellow.500","yellow.600","yellow.700","yellow.800","yellow.900","green.50","green.100","green.200","green.300","green.400","green.500","green.600","green.700","green.800","green.900","teal.50","teal.100","teal.200","teal.300","teal.400","teal.500","teal.600","teal.700","teal.800","teal.900","blue.50","blue.100","blue.200","blue.300","blue.400","blue.500","blue.600","blue.700","blue.800","blue.900","cyan.50","cyan.100","cyan.200","cyan.300","cyan.400","cyan.500","cyan.600","cyan.700","cyan.800","cyan.900","purple.50","purple.100","purple.200","purple.300","purple.400","purple.500","purple.600","purple.700","purple.800","purple.900","pink.50","pink.100","pink.200","pink.300","pink.400","pink.500","pink.600","pink.700","pink.800","pink.900","whiteAlpha.50","whiteAlpha.100","whiteAlpha.200","whiteAlpha.300","whiteAlpha.400","whiteAlpha.500","whiteAlpha.600","whiteAlpha.700","whiteAlpha.800","whiteAlpha.900","blackAlpha.50","blackAlpha.100","blackAlpha.200","blackAlpha.300","blackAlpha.400","blackAlpha.500","blackAlpha.600","blackAlpha.700","blackAlpha.800","blackAlpha.900"],"description":"Border color; needs `borderWidth`. Literal token only; never a binding or function call."},"shadow":{"type":"string","enum":["none","xs","sm","base","md","lg","xl","2xl","inner","dark-lg"],"description":"Box shadow. Literal token only; never a binding or function call."},"w":{"type":"string","enum":["full","3xs","2xs","xs","sm","md","lg","xl","2xl","3xl","4xl","5xl","6xl","container.sm","container.md","container.lg","container.xl"],"description":"Width (\"full\" = 100% of the parent). Literal token only; never a binding or function call."},"maxW":{"type":"string","enum":["full","3xs","2xs","xs","sm","md","lg","xl","2xl","3xl","4xl","5xl","6xl","container.sm","container.md","container.lg","container.xl"],"description":"Maximum width (\"container.md\" etc. for page columns). Literal token only; never a binding or function call."},"minH":{"type":"string","enum":["full","3xs","2xs","xs","sm","md","lg","xl","2xl","3xl","4xl","5xl","6xl","container.sm","container.md","container.lg","container.xl"],"description":"Minimum height. Literal token only; never a binding or function call."},"textAlign":{"type":"string","enum":["left","center","right"],"description":"Horizontal alignment of inline content. Literal token only; never a binding or function call."}}},"ColorProp":{"type":"object","properties":{"color":{"type":"string","enum":["black","white","transparent","gray.50","gray.100","gray.200","gray.300","gray.400","gray.500","gray.600","gray.700","gray.800","gray.900","red.50","red.100","red.200","red.300","red.400","red.500","red.600","red.700","red.800","red.900","orange.50","orange.100","orange.200","orange.300","orange.400","orange.500","orange.600","orange.700","orange.800","orange.900","yellow.50","yellow.100","yellow.200","yellow.300","yellow.400","yellow.500","yellow.600","yellow.700","yellow.800","yellow.900","green.50","green.100","green.200","green.300","green.400","green.500","green.600","green.700","green.800","green.900","teal.50","teal.100","teal.200","teal.300","teal.400","teal.500","teal.600","teal.700","teal.800","teal.900","blue.50","blue.100","blue.200","blue.300","blue.400","blue.500","blue.600","blue.700","blue.800","blue.900","cyan.50","cyan.100","cyan.200","cyan.300","cyan.400","cyan.500","cyan.600","cyan.700","cyan.800","cyan.900","purple.50","purple.100","purple.200","purple.300","purple.400","purple.500","purple.600","purple.700","purple.800","purple.900","pink.50","pink.100","pink.200","pink.300","pink.400","pink.500","pink.600","pink.700","pink.800","pink.900","whiteAlpha.50","whiteAlpha.100","whiteAlpha.200","whiteAlpha.300","whiteAlpha.400","whiteAlpha.500","whiteAlpha.600","whiteAlpha.700","whiteAlpha.800","whiteAlpha.900","blackAlpha.50","blackAlpha.100","blackAlpha.200","blackAlpha.300","blackAlpha.400","blackAlpha.500","blackAlpha.600","blackAlpha.700","blackAlpha.800","blackAlpha.900"],"description":"Text or icon color (e.g. \"gray.400\"); omit it to inherit the current text color. Literal token only; never a binding or function call."}}},"theme":{"type":"object","properties":{},"additionalProperties":false},"anyComponent":{"oneOf":[{"$ref":"#/components/Box"},{"$ref":"#/components/Center"},{"$ref":"#/components/Container"},{"$ref":"#/components/Flex"},{"$ref":"#/components/Grid"},{"$ref":"#/components/Heading"},{"$ref":"#/components/Text"},{"$ref":"#/components/Button"},{"$ref":"#/components/Input"},{"$ref":"#/components/Checkbox"},{"$ref":"#/components/RadioGroup"},{"$ref":"#/components/Switch"},{"$ref":"#/components/List"},{"$ref":"#/components/Table"},{"$ref":"#/components/Tag"},{"$ref":"#/components/Modal"},{"$ref":"#/components/Tabs"},{"$ref":"#/components/Avatar"},{"$ref":"#/components/Icon"}],"discriminator":{"propertyName":"component"}},"anyFunction":{"oneOf":[{"$ref":"#/functions/required"},{"$ref":"#/functions/regex"},{"$ref":"#/functions/length"},{"$ref":"#/functions/numeric"},{"$ref":"#/functions/email"},{"$ref":"#/functions/formatString"},{"$ref":"#/functions/formatNumber"},{"$ref":"#/functions/formatCurrency"},{"$ref":"#/functions/formatDate"},{"$ref":"#/functions/pluralize"},{"$ref":"#/functions/openUrl"},{"$ref":"#/functions/and"},{"$ref":"#/functions/or"},{"$ref":"#/functions/not"}]}}}

---END A2UI JSON SCHEMA---

### Examples:
<a2ui-json>
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "login",
      "catalogId": "urn:agentic-ui:catalog:ui-kit-one:v1",
      "sendDataModel": true
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "login",
      "path": "/form",
      "value": {
        "email": "",
        "password": "",
        "remember": true
      }
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "login",
      "components": [
        {
          "id": "root",
          "component": "Container",
          "maxW": "container.sm",
          "py": "10",
          "children": [
            "card"
          ]
        },
        {
          "id": "card",
          "component": "Flex",
          "direction": "column",
          "gap": "5",
          "bg": "gray.700",
          "p": "8",
          "borderRadius": "xl",
          "borderWidth": "1px",
          "borderColor": "whiteAlpha.100",
          "children": [
            "title",
            "subtitle",
            "email",
            "password",
            "remember",
            "submit"
          ]
        },
        {
          "id": "title",
          "component": "Heading",
          "text": "Вход в интернет-банк",
          "as": "h1",
          "size": "lg"
        },
        {
          "id": "subtitle",
          "component": "Text",
          "text": "Используйте почту, указанную при открытии счёта.",
          "color": "gray.400"
        },
        {
          "id": "email",
          "component": "Input",
          "label": "Электронная почта",
          "value": {
            "path": "/form/email"
          },
          "type": "email",
          "placeholder": "name@example.ru",
          "isRequired": true,
          "checks": [
            {
              "condition": {
                "call": "required",
                "args": {
                  "value": {
                    "path": "/form/email"
                  }
                }
              },
              "message": "Введите адрес почты"
            },
            {
              "condition": {
                "call": "email",
                "args": {
                  "value": {
                    "path": "/form/email"
                  }
                }
              },
              "message": "Адрес почты указан неверно"
            }
          ]
        },
        {
          "id": "password",
          "component": "Input",
          "label": "Пароль",
          "value": {
            "path": "/form/password"
          },
          "type": "password",
          "isRequired": true,
          "checks": [
            {
              "condition": {
                "call": "length",
                "args": {
                  "value": {
                    "path": "/form/password"
                  },
                  "min": 8
                }
              },
              "message": "Не короче 8 символов"
            }
          ]
        },
        {
          "id": "remember",
          "component": "Checkbox",
          "label": "Запомнить меня на этом устройстве",
          "value": {
            "path": "/form/remember"
          }
        },
        {
          "id": "submit",
          "component": "Button",
          "label": "Войти",
          "colorScheme": "blue",
          "isFullWidth": true,
          "action": {
            "event": {
              "name": "login.submit",
              "context": {
                "email": {
                  "path": "/form/email"
                }
              }
            }
          },
          "checks": [
            {
              "condition": {
                "call": "required",
                "args": {
                  "value": {
                    "path": "/form/email"
                  }
                }
              },
              "message": "Введите почту"
            },
            {
              "condition": {
                "call": "email",
                "args": {
                  "value": {
                    "path": "/form/email"
                  }
                }
              },
              "message": "Неверная почта"
            },
            {
              "condition": {
                "call": "length",
                "args": {
                  "value": {
                    "path": "/form/password"
                  },
                  "min": 8
                }
              },
              "message": "Короткий пароль"
            }
          ]
        }
      ]
    }
  }
]
</a2ui-json>

<a2ui-json>
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "signup",
      "catalogId": "urn:agentic-ui:catalog:ui-kit-one:v1",
      "sendDataModel": true
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "signup",
      "path": "/form",
      "value": {
        "name": "",
        "email": "",
        "phone": "",
        "password": "",
        "plan": "standard",
        "news": false
      }
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "signup",
      "components": [
        {
          "id": "root",
          "component": "Container",
          "maxW": "container.sm",
          "py": "8",
          "children": [
            "card"
          ]
        },
        {
          "id": "card",
          "component": "Flex",
          "direction": "column",
          "gap": "4",
          "bg": "gray.700",
          "p": "8",
          "borderRadius": "xl",
          "borderWidth": "1px",
          "borderColor": "whiteAlpha.100",
          "children": [
            "title",
            "name",
            "email",
            "phone",
            "password",
            "plan",
            "news",
            "submit"
          ]
        },
        {
          "id": "title",
          "component": "Heading",
          "text": "Откройте счёт за 5 минут",
          "as": "h1",
          "size": "lg"
        },
        {
          "id": "name",
          "component": "Input",
          "label": "ФИО",
          "value": {
            "path": "/form/name"
          },
          "placeholder": "Иванова Анна Сергеевна",
          "isRequired": true,
          "checks": [
            {
              "condition": {
                "call": "required",
                "args": {
                  "value": {
                    "path": "/form/name"
                  }
                }
              },
              "message": "Укажите ФИО"
            }
          ]
        },
        {
          "id": "email",
          "component": "Input",
          "label": "Электронная почта",
          "value": {
            "path": "/form/email"
          },
          "type": "email",
          "isRequired": true,
          "checks": [
            {
              "condition": {
                "call": "required",
                "args": {
                  "value": {
                    "path": "/form/email"
                  }
                }
              },
              "message": "Укажите почту"
            },
            {
              "condition": {
                "call": "email",
                "args": {
                  "value": {
                    "path": "/form/email"
                  }
                }
              },
              "message": "Адрес почты указан неверно"
            }
          ]
        },
        {
          "id": "phone",
          "component": "Input",
          "label": "Телефон",
          "value": {
            "path": "/form/phone"
          },
          "type": "tel",
          "placeholder": "+79991234567",
          "helperText": "Пришлём код подтверждения",
          "isRequired": true,
          "checks": [
            {
              "condition": {
                "call": "regex",
                "args": {
                  "value": {
                    "path": "/form/phone"
                  },
                  "pattern": "^\\+7\\d{10}$"
                }
              },
              "message": "Формат: +7 и 10 цифр"
            }
          ]
        },
        {
          "id": "password",
          "component": "Input",
          "label": "Пароль",
          "value": {
            "path": "/form/password"
          },
          "type": "password",
          "isRequired": true,
          "checks": [
            {
              "condition": {
                "call": "length",
                "args": {
                  "value": {
                    "path": "/form/password"
                  },
                  "min": 8
                }
              },
              "message": "Не короче 8 символов"
            }
          ]
        },
        {
          "id": "plan",
          "component": "RadioGroup",
          "label": "Тариф",
          "value": {
            "path": "/form/plan"
          },
          "direction": "row",
          "options": [
            {
              "label": "Стандарт",
              "value": "standard"
            },
            {
              "label": "Премиум",
              "value": "premium"
            },
            {
              "label": "Студенческий",
              "value": "student"
            }
          ]
        },
        {
          "id": "news",
          "component": "Switch",
          "label": "Получать новости и предложения банка",
          "value": {
            "path": "/form/news"
          }
        },
        {
          "id": "submit",
          "component": "Button",
          "label": "Создать аккаунт",
          "colorScheme": "blue",
          "isFullWidth": true,
          "action": {
            "event": {
              "name": "signup.submit"
            }
          },
          "checks": [
            {
              "condition": {
                "call": "required",
                "args": {
                  "value": {
                    "path": "/form/name"
                  }
                }
              },
              "message": "ФИО"
            },
            {
              "condition": {
                "call": "email",
                "args": {
                  "value": {
                    "path": "/form/email"
                  }
                }
              },
              "message": "Почта"
            },
            {
              "condition": {
                "call": "regex",
                "args": {
                  "value": {
                    "path": "/form/phone"
                  },
                  "pattern": "^\\+7\\d{10}$"
                }
              },
              "message": "Телефон"
            },
            {
              "condition": {
                "call": "length",
                "args": {
                  "value": {
                    "path": "/form/password"
                  },
                  "min": 8
                }
              },
              "message": "Пароль"
            }
          ]
        }
      ]
    }
  }
]
</a2ui-json>

<a2ui-json>
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "settings",
      "catalogId": "urn:agentic-ui:catalog:ui-kit-one:v1",
      "sendDataModel": true
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "settings",
      "path": "/settings",
      "value": {
        "push": true,
        "email": false,
        "sms": true,
        "twoFactor": true,
        "confirm": "push"
      }
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "settings",
      "components": [
        {
          "id": "root",
          "component": "Container",
          "maxW": "container.md",
          "py": "8",
          "children": [
            "stack"
          ]
        },
        {
          "id": "stack",
          "component": "Flex",
          "direction": "column",
          "gap": "6",
          "children": [
            "title",
            "notifications",
            "confirm",
            "save"
          ]
        },
        {
          "id": "title",
          "component": "Heading",
          "text": "Настройки",
          "as": "h1",
          "size": "lg"
        },
        {
          "id": "notifications",
          "component": "Flex",
          "direction": "column",
          "gap": "4",
          "bg": "gray.700",
          "p": "5",
          "borderRadius": "xl",
          "borderWidth": "1px",
          "borderColor": "whiteAlpha.100",
          "children": [
            "n-title",
            "push",
            "email",
            "sms",
            "twofa"
          ]
        },
        {
          "id": "n-title",
          "component": "Heading",
          "text": "Уведомления и защита",
          "as": "h2",
          "size": "sm"
        },
        {
          "id": "push",
          "component": "Switch",
          "label": "Push-уведомления об операциях",
          "value": {
            "path": "/settings/push"
          }
        },
        {
          "id": "email",
          "component": "Switch",
          "label": "Выписка на почту раз в месяц",
          "value": {
            "path": "/settings/email"
          }
        },
        {
          "id": "sms",
          "component": "Switch",
          "label": "SMS о входе в приложение",
          "value": {
            "path": "/settings/sms"
          }
        },
        {
          "id": "twofa",
          "component": "Switch",
          "label": "Двухфакторная аутентификация",
          "value": {
            "path": "/settings/twoFactor"
          },
          "colorScheme": "green"
        },
        {
          "id": "confirm",
          "component": "RadioGroup",
          "label": "Подтверждение операций",
          "value": {
            "path": "/settings/confirm"
          },
          "options": [
            {
              "label": "Push-уведомлением",
              "value": "push"
            },
            {
              "label": "Кодом из SMS",
              "value": "sms"
            },
            {
              "label": "Кодом из приложения",
              "value": "totp"
            }
          ]
        },
        {
          "id": "save",
          "component": "Button",
          "label": "Сохранить изменения",
          "colorScheme": "blue",
          "action": {
            "event": {
              "name": "settings.save"
            }
          }
        }
      ]
    }
  }
]
</a2ui-json>

<a2ui-json>
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "users",
      "catalogId": "urn:agentic-ui:catalog:ui-kit-one:v1"
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "users",
      "path": "/users",
      "value": [
        {
          "id": "u1",
          "name": "Анна Смирнова",
          "email": "anna@example.ru",
          "role": "Владелец"
        },
        {
          "id": "u2",
          "name": "Игорь Петров",
          "email": "igor@example.ru",
          "role": "Бухгалтер"
        },
        {
          "id": "u3",
          "name": "Мария Кузнецова",
          "email": "maria@example.ru",
          "role": "Наблюдатель"
        }
      ]
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "users",
      "components": [
        {
          "id": "root",
          "component": "Container",
          "maxW": "container.md",
          "py": "8",
          "children": [
            "stack"
          ]
        },
        {
          "id": "stack",
          "component": "Flex",
          "direction": "column",
          "gap": "4",
          "children": [
            "title",
            "list"
          ]
        },
        {
          "id": "title",
          "component": "Heading",
          "text": "Доступ к счёту",
          "as": "h1",
          "size": "lg"
        },
        {
          "id": "list",
          "component": "List",
          "spacing": "3",
          "children": {
            "componentId": "row",
            "path": "/users"
          }
        },
        {
          "id": "row",
          "component": "Flex",
          "align": "center",
          "gap": "4",
          "bg": "gray.700",
          "p": "4",
          "borderRadius": "xl",
          "borderWidth": "1px",
          "borderColor": "whiteAlpha.100",
          "children": [
            "avatar",
            "who",
            "role",
            "open"
          ]
        },
        {
          "id": "avatar",
          "component": "Avatar",
          "name": {
            "path": "name"
          },
          "size": "md"
        },
        {
          "id": "who",
          "component": "Flex",
          "direction": "column",
          "w": "full",
          "children": [
            "name",
            "email"
          ]
        },
        {
          "id": "name",
          "component": "Text",
          "text": {
            "path": "name"
          },
          "fontWeight": "semibold"
        },
        {
          "id": "email",
          "component": "Text",
          "text": {
            "path": "email"
          },
          "fontSize": "sm",
          "color": "gray.400"
        },
        {
          "id": "role",
          "component": "Tag",
          "label": {
            "path": "role"
          },
          "colorScheme": "purple"
        },
        {
          "id": "open",
          "component": "Button",
          "label": "Открыть",
          "variant": "ghost",
          "size": "sm",
          "action": {
            "event": {
              "name": "user.open",
              "context": {
                "userId": {
                  "path": "id"
                }
              }
            }
          }
        }
      ]
    }
  }
]
</a2ui-json>

<a2ui-json>
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "payments",
      "catalogId": "urn:agentic-ui:catalog:ui-kit-one:v1"
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "payments",
      "path": "/payments",
      "value": [
        {
          "date": "2026-10-03",
          "payee": "ООО «Ромашка»",
          "purpose": "Аренда офиса",
          "amount": 85000
        },
        {
          "date": "2026-10-10",
          "payee": "ИП Соколов",
          "purpose": "Разработка сайта",
          "amount": 42500
        },
        {
          "date": "2026-10-15",
          "payee": "ПАО «Ростелеком»",
          "purpose": "Интернет и телефония",
          "amount": 3900
        },
        {
          "date": "2026-10-21",
          "payee": "ООО «Канцмир»",
          "purpose": "Канцтовары",
          "amount": 7350.4
        }
      ]
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "payments",
      "components": [
        {
          "id": "root",
          "component": "Container",
          "maxW": "container.lg",
          "py": "8",
          "children": [
            "stack"
          ]
        },
        {
          "id": "stack",
          "component": "Flex",
          "direction": "column",
          "gap": "4",
          "children": [
            "head",
            "table"
          ]
        },
        {
          "id": "head",
          "component": "Flex",
          "justify": "space-between",
          "align": "center",
          "children": [
            "title",
            "badge"
          ]
        },
        {
          "id": "title",
          "component": "Heading",
          "text": "Платежи за октябрь",
          "as": "h1",
          "size": "lg"
        },
        {
          "id": "badge",
          "component": "Tag",
          "label": "Обновлено сегодня",
          "colorScheme": "green"
        },
        {
          "id": "table",
          "component": "Table",
          "variant": "striped",
          "rows": {
            "path": "/payments"
          },
          "caption": "Исходящие платежи по расчётному счёту",
          "columns": [
            {
              "header": "Дата",
              "key": "date",
              "format": "date"
            },
            {
              "header": "Получатель",
              "key": "payee"
            },
            {
              "header": "Назначение",
              "key": "purpose"
            },
            {
              "header": "Сумма",
              "key": "amount",
              "format": "currency",
              "align": "right"
            }
          ]
        }
      ]
    }
  }
]
</a2ui-json>

<a2ui-json>
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "orders",
      "catalogId": "urn:agentic-ui:catalog:ui-kit-one:v1"
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "orders",
      "path": "/",
      "value": {
        "orders": [
          {
            "id": "1023",
            "title": "Заказ №1023 · Наушники",
            "status": "Доставлен"
          },
          {
            "id": "1024",
            "title": "Заказ №1024 · Чехол для телефона",
            "status": "В пути"
          },
          {
            "id": "1025",
            "title": "Заказ №1025 · Зарядное устройство",
            "status": "Отменён"
          }
        ]
      }
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "orders",
      "components": [
        {
          "id": "root",
          "component": "Container",
          "maxW": "container.sm",
          "py": "8",
          "children": [
            "stack"
          ]
        },
        {
          "id": "stack",
          "component": "Flex",
          "direction": "column",
          "gap": "3",
          "children": [
            "title",
            "row-0",
            "row-1",
            "row-2",
            "refresh"
          ]
        },
        {
          "id": "title",
          "component": "Heading",
          "text": "Мои заказы",
          "as": "h1",
          "size": "lg"
        },
        {
          "id": "row-0",
          "component": "Flex",
          "justify": "space-between",
          "align": "center",
          "gap": "3",
          "bg": "gray.700",
          "p": "4",
          "borderRadius": "xl",
          "borderWidth": "1px",
          "borderColor": "whiteAlpha.100",
          "children": [
            "row-0-title",
            "row-0-status"
          ]
        },
        {
          "id": "row-0-title",
          "component": "Text",
          "text": {
            "path": "/orders/0/title"
          }
        },
        {
          "id": "row-0-status",
          "component": "Tag",
          "label": {
            "path": "/orders/0/status"
          },
          "colorScheme": "green",
          "variant": "subtle"
        },
        {
          "id": "row-1",
          "component": "Flex",
          "justify": "space-between",
          "align": "center",
          "gap": "3",
          "bg": "gray.700",
          "p": "4",
          "borderRadius": "xl",
          "borderWidth": "1px",
          "borderColor": "whiteAlpha.100",
          "children": [
            "row-1-title",
            "row-1-status"
          ]
        },
        {
          "id": "row-1-title",
          "component": "Text",
          "text": {
            "path": "/orders/1/title"
          }
        },
        {
          "id": "row-1-status",
          "component": "Tag",
          "label": {
            "path": "/orders/1/status"
          },
          "colorScheme": "orange",
          "variant": "subtle"
        },
        {
          "id": "row-2",
          "component": "Flex",
          "justify": "space-between",
          "align": "center",
          "gap": "3",
          "bg": "gray.700",
          "p": "4",
          "borderRadius": "xl",
          "borderWidth": "1px",
          "borderColor": "whiteAlpha.100",
          "children": [
            "row-2-title",
            "row-2-status"
          ]
        },
        {
          "id": "row-2-title",
          "component": "Text",
          "text": {
            "path": "/orders/2/title"
          }
        },
        {
          "id": "row-2-status",
          "component": "Tag",
          "label": {
            "path": "/orders/2/status"
          },
          "colorScheme": "red",
          "variant": "subtle"
        },
        {
          "id": "refresh",
          "component": "Button",
          "label": "Обновить статусы",
          "variant": "outline",
          "leftIcon": "repeat",
          "action": {
            "event": {
              "name": "orders.refresh"
            }
          }
        }
      ]
    }
  }
]
</a2ui-json>

<a2ui-json>
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "payments",
      "catalogId": "urn:agentic-ui:catalog:ui-kit-one:v1"
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "payments",
      "path": "/",
      "value": {
        "payments": [
          {
            "id": "p1",
            "date": "2026-10-01",
            "title": "Пятёрочка",
            "amount": 1840.5,
            "status": "Выполнен"
          },
          {
            "id": "p2",
            "date": "2026-10-02",
            "title": "МТС, мобильная связь",
            "amount": 650,
            "status": "Выполнен"
          },
          {
            "id": "p3",
            "date": "2026-10-03",
            "title": "Яндекс Такси",
            "amount": 430,
            "status": "Выполнен"
          },
          {
            "id": "p4",
            "date": "2026-10-04",
            "title": "Аптека «Ригла»",
            "amount": 1215.9,
            "status": "В обработке"
          },
          {
            "id": "p5",
            "date": "2026-10-05",
            "title": "ЖКХ, октябрь",
            "amount": 7340,
            "status": "Выполнен"
          },
          {
            "id": "p6",
            "date": "2026-10-06",
            "title": "Кофейня «Зерно»",
            "amount": 320,
            "status": "Выполнен"
          },
          {
            "id": "p7",
            "date": "2026-10-07",
            "title": "Ozon",
            "amount": 2990,
            "status": "Возврат"
          },
          {
            "id": "p8",
            "date": "2026-10-08",
            "title": "Ростелеком, интернет",
            "amount": 900,
            "status": "Выполнен"
          }
        ],
        "total": 15686.4
      }
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "payments",
      "components": [
        {
          "id": "root",
          "component": "Container",
          "maxW": "container.md",
          "py": "8",
          "children": [
            "stack"
          ]
        },
        {
          "id": "stack",
          "component": "Flex",
          "direction": "column",
          "gap": "4",
          "children": [
            "header",
            "list"
          ]
        },
        {
          "id": "header",
          "component": "Flex",
          "justify": "space-between",
          "align": "center",
          "children": [
            "title",
            "total"
          ]
        },
        {
          "id": "title",
          "component": "Heading",
          "text": "Платежи за октябрь",
          "as": "h1",
          "size": "lg"
        },
        {
          "id": "total",
          "component": "Text",
          "text": {
            "call": "formatCurrency",
            "args": {
              "value": {
                "path": "/total"
              },
              "currency": "RUB"
            }
          },
          "fontWeight": "semibold"
        },
        {
          "id": "list",
          "component": "List",
          "variant": "plain",
          "spacing": "2",
          "children": {
            "componentId": "payment",
            "path": "/payments"
          }
        },
        {
          "id": "payment",
          "component": "Flex",
          "align": "center",
          "gap": "4",
          "bg": "gray.700",
          "p": "4",
          "borderRadius": "xl",
          "borderWidth": "1px",
          "borderColor": "whiteAlpha.100",
          "children": [
            "payment-info",
            "payment-amount",
            "payment-status",
            "payment-repeat"
          ]
        },
        {
          "id": "payment-info",
          "component": "Flex",
          "direction": "column",
          "w": "full",
          "children": [
            "payment-title",
            "payment-date"
          ]
        },
        {
          "id": "payment-title",
          "component": "Text",
          "text": {
            "path": "title"
          },
          "fontWeight": "medium"
        },
        {
          "id": "payment-date",
          "component": "Text",
          "text": {
            "call": "formatDate",
            "args": {
              "value": {
                "path": "date"
              },
              "format": "dd.MM.yyyy"
            }
          },
          "fontSize": "sm",
          "color": "gray.400"
        },
        {
          "id": "payment-amount",
          "component": "Text",
          "text": {
            "call": "formatCurrency",
            "args": {
              "value": {
                "path": "amount"
              },
              "currency": "RUB"
            }
          },
          "fontWeight": "semibold"
        },
        {
          "id": "payment-status",
          "component": "Tag",
          "label": {
            "path": "status"
          },
          "variant": "outline"
        },
        {
          "id": "payment-repeat",
          "component": "Button",
          "label": "Повторить",
          "variant": "ghost",
          "size": "sm",
          "action": {
            "event": {
              "name": "payment.repeat",
              "context": {
                "paymentId": {
                  "path": "id"
                }
              }
            }
          }
        }
      ]
    }
  }
]
</a2ui-json>

<a2ui-json>
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "transfer",
      "catalogId": "urn:agentic-ui:catalog:ui-kit-one:v1",
      "sendDataModel": true
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "transfer",
      "path": "/",
      "value": {
        "transfer": {
          "id": "tr-7781",
          "recipient": "Анна Смирнова",
          "card": "•• 4821",
          "amount": 15000,
          "fee": 0
        }
      }
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "transfer",
      "components": [
        {
          "id": "root",
          "component": "Container",
          "maxW": "container.sm",
          "py": "8",
          "children": [
            "card"
          ]
        },
        {
          "id": "card",
          "component": "Flex",
          "direction": "column",
          "gap": "4",
          "bg": "gray.700",
          "p": "6",
          "borderRadius": "xl",
          "borderWidth": "1px",
          "borderColor": "whiteAlpha.100",
          "children": [
            "title",
            "recipient",
            "amount",
            "confirm-modal"
          ]
        },
        {
          "id": "title",
          "component": "Heading",
          "text": "Перевод по номеру карты",
          "as": "h1",
          "size": "md"
        },
        {
          "id": "recipient",
          "component": "Text",
          "text": {
            "call": "formatString",
            "args": {
              "value": "${/transfer/recipient}, карта ${/transfer/card}"
            }
          },
          "color": "gray.300"
        },
        {
          "id": "amount",
          "component": "Text",
          "text": {
            "call": "formatCurrency",
            "args": {
              "value": {
                "path": "/transfer/amount"
              },
              "currency": "RUB"
            }
          },
          "fontSize": "2xl",
          "fontWeight": "bold"
        },
        {
          "id": "confirm-modal",
          "component": "Modal",
          "trigger": "open-confirm",
          "content": "confirm-body",
          "title": "Подтвердите перевод",
          "size": "md"
        },
        {
          "id": "open-confirm",
          "component": "Button",
          "label": "Перевести",
          "colorScheme": "blue",
          "isFullWidth": true,
          "action": {
            "event": {
              "name": "modal.open"
            }
          }
        },
        {
          "id": "confirm-body",
          "component": "Flex",
          "direction": "column",
          "gap": "4",
          "children": [
            "confirm-text",
            "confirm-fee",
            "confirm-actions"
          ]
        },
        {
          "id": "confirm-text",
          "component": "Text",
          "text": {
            "call": "formatString",
            "args": {
              "value": "Получатель: ${/transfer/recipient}"
            }
          }
        },
        {
          "id": "confirm-fee",
          "component": "Text",
          "text": "Комиссия не взимается",
          "fontSize": "sm",
          "color": "gray.400"
        },
        {
          "id": "confirm-actions",
          "component": "Flex",
          "justify": "flex-end",
          "gap": "3",
          "children": [
            "confirm-cancel",
            "confirm-send"
          ]
        },
        {
          "id": "confirm-cancel",
          "component": "Button",
          "label": "Отмена",
          "variant": "ghost",
          "action": {
            "event": {
              "name": "transfer.cancel"
            }
          }
        },
        {
          "id": "confirm-send",
          "component": "Button",
          "label": "Подтвердить",
          "colorScheme": "blue",
          "action": {
            "event": {
              "name": "transfer.confirm",
              "context": {
                "transferId": {
                  "path": "/transfer/id"
                }
              }
            }
          }
        }
      ]
    }
  }
]
</a2ui-json>

<a2ui-json>
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "checklist",
      "catalogId": "urn:agentic-ui:catalog:ui-kit-one:v1",
      "sendDataModel": true
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "checklist",
      "path": "/",
      "value": {
        "tasks": [
          {
            "id": "t1",
            "title": "Подтвердить e-mail",
            "done": true,
            "note": "Сделано"
          },
          {
            "id": "t2",
            "title": "Загрузить паспорт",
            "done": false,
            "note": "Нужно сделать"
          },
          {
            "id": "t3",
            "title": "Указать доход",
            "done": false,
            "note": "Нужно сделать"
          },
          {
            "id": "t4",
            "title": "Подписать согласие",
            "done": false,
            "note": "Нужно сделать"
          }
        ]
      }
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "checklist",
      "components": [
        {
          "id": "root",
          "component": "Container",
          "maxW": "container.sm",
          "py": "8",
          "children": [
            "stack"
          ]
        },
        {
          "id": "stack",
          "component": "Flex",
          "direction": "column",
          "gap": "4",
          "children": [
            "title",
            "hint",
            "tasks",
            "save"
          ]
        },
        {
          "id": "title",
          "component": "Heading",
          "text": "Заявка на кредит",
          "as": "h1",
          "size": "lg"
        },
        {
          "id": "hint",
          "component": "Text",
          "text": "Отметьте выполненные шаги",
          "color": "gray.400"
        },
        {
          "id": "tasks",
          "component": "List",
          "variant": "plain",
          "spacing": "2",
          "children": {
            "componentId": "task",
            "path": "/tasks"
          }
        },
        {
          "id": "task",
          "component": "Flex",
          "justify": "space-between",
          "align": "center",
          "gap": "3",
          "bg": "gray.700",
          "p": "4",
          "borderRadius": "xl",
          "borderWidth": "1px",
          "borderColor": "whiteAlpha.100",
          "children": [
            "task-done",
            "task-note"
          ]
        },
        {
          "id": "task-done",
          "component": "Checkbox",
          "label": {
            "path": "title"
          },
          "value": {
            "path": "done"
          },
          "colorScheme": "green"
        },
        {
          "id": "task-note",
          "component": "Tag",
          "label": {
            "path": "note"
          },
          "size": "sm"
        },
        {
          "id": "save",
          "component": "Button",
          "label": "Сохранить прогресс",
          "colorScheme": "blue",
          "action": {
            "event": {
              "name": "checklist.save"
            }
          }
        }
      ]
    }
  }
]
</a2ui-json>
