(() => {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;

  try {
    const doc = app.defaultDocument;
    const result = {
      hasDocument: doc !== null,
    };

    // Try to get current window perspective
    try {
      const windows = app.windows();
      if (windows.length > 0) {
        const window = windows[0];
        const perspective = window.perspective();
        if (perspective) {
          result.currentPerspective = perspective.name();
        }
      }
    } catch (e) {
      result.perspectiveError = e.toString();
    }

    // Try evaluateJavascript to get perspectives
    try {
      const jsCode =
        '(() => { const r = {}; if (typeof Perspective !== "undefined") { if (Perspective.all) { r.count = Perspective.all.length; r.names = Perspective.all.map(p => p.name); } } return JSON.stringify(r); })()';

      const perspectivesJson = app.evaluateJavascript(jsCode);
      result.perspectives = JSON.parse(perspectivesJson);
    } catch (e) {
      result.evaluateError = e.toString();
    }

    return JSON.stringify(result, null, 2);
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  }
})();
