// TypeScript definitions for OmniFocus 4.9 (187.2.1) on macOS 27
// Generated on 2026-09-15 19:28:28 +0000
//
// Generated via: app.getTypeScriptDeclarations() over the JXA bridge (osascript one-liner),
// then optional-before-required parameters normalized (see README carry-overs)
// See src/omnifocus/api/README.md for regeneration instructions
//

// To use these definitions, save this file as `OmniFocus.d.ts`
// and create a `tsconfig.json` file with compiler settings which indicate
// an appropriate set of implicitly defined TypeScript libraries:
//
// {
//     "compilerOptions": {
//         "lib": ["es7"]
//     }
// }

// Alert

declare class Alert {
  // An alert interface for displaying information to the user, blocking further interaction until the alert is dismissed.

  constructor(title: string, message: string);
  // Create a new alert panel with the given title and text contents.
  show(callback?: (option: number) => void | null): Promise<number>;
  // Displays the alert. If no options have yet been added, a default "OK" option is added. Once the user selects an option, the alert is dismissed. If a callback function was supplied, it is invoked with the zero-based index of the selected option as its argument. A `Promise` is returned as well, which may also be used to collect the result of the `Alert`.
  addOption(string: string): void;
  // Adds an option button to the alert.
}

// Application

declare class Application {
  getTypeScriptDeclarations(filterString?: string | null): string;
  // Returns TypeScript declarations for Omni Automation classes that have API or documentation that matches the provided filter string.
  openDocument(
    from: Document | null,
    url: URL,
    completed: (documentOrError: Document | Error, alreadyOpen: boolean) => void,
  ): void;
  // Attempts to open the specified document and return a reference to it asynchronously. If the document is already open, the reference is passed along. Note that due to platform sandboxing restrictions, opening the document may fail if the application doesn't have currently permission to access the given `URL`. The document, if any, that is associated with the calling script can be passed along to help grant permission to open the new document.
  // The passed in function will be passed two argument. The first will be either either the `Document` or an `Error`. On success, the second argument is a `Boolean` specifying whether the document was already open.
  readonly buildVersion: Version;
  // The internal build version number for the app. See also `userVersion`.
  readonly commandKeyDown: boolean;
  // Whether the Command key is currently down.
  readonly controlKeyDown: boolean;
  // Whether the Control key is currently down.
  readonly name: string; // Application name.
  readonly optionKeyDown: boolean;
  // Whether the Option key is currently down.
  readonly platformName: string;
  // Returns a string describing the current platform, currently `"iOS"` or `"macOS"`.
  readonly shiftKeyDown: boolean;
  // Whether the Shift key is currently down.
  readonly userVersion: Version;
  // The user-visible version number for the app. See also `buildVersion`.
  readonly version: string;
  // Deprecated: Recommend using either `userVersion` or `buildVersion`.
  // For backwards compatibility with existing scripts, this returns the same result as `buildVersion.versionString`. We recommend using either the user-visible `userVersion` or the internal `buildVersion` instead, which are more clear about which version they're returning and provide their results as `Version` objects which can be semantically compared with other `Version` objects.
}

// ApplyResult

declare namespace ApplyResult {
  const SkipChildren: ApplyResult;
  // The descendants of the current item are skipped.
  const SkipPeers: ApplyResult;
  // The unvisited peers of the current item are skipped.
  const Stop: ApplyResult;
  // The call to `apply` terminates with no further items being visited.
  const all: Array<ApplyResult>;
}

declare class ApplyResult {}

// FolderArray

declare class FolderArray extends Array {
  // An `Array` containing `Folder` objects.

  byName(name: string): Folder | null;
  // Returns the first `Folder` contained directly in this array with the given name.
}

// ProjectArray

declare class ProjectArray extends Array {
  // An `Array` containing `Project` objects.

  byName(name: string): Project | null;
  // Returns the first `Project` contained directly in this array with the given name.
}

// SectionArray

declare class SectionArray extends Array {
  // An `Array` containing `Project` and `Folder` objects.

  byName(name: string): Project | Folder | null;
  // Returns the first `Project` or `Folder` contained directly in this array with the given name.
}

// Library

declare class Library extends SectionArray {
  // An `Array` of folders and projects at the top level of the database. (This can be referenced via the top-level global variable `library`.)

  apply(f: (section: Project | Folder) => ApplyResult | null): ApplyResult | null;
  // Calls the given function for each `Folder` and `Project` in the `Library` and recursively into any child folders. Note that the tasks in projects are not included. The supplied function can optionally return a `ApplyResult` to skip enumeration of some elements.
  readonly beginning: Folder.ChildInsertionLocation;
  // Returns a location referring to the beginning of the top-level projects and folders in the database. (Reference this using `library.beginning`.)
  readonly ending: Folder.ChildInsertionLocation;
  // Returns a location referring to the ending of the top-level projects and folders in the database. (Reference this using `library.ending`.)
}

// TagArray

declare class TagArray extends Array {
  // An `Array` containing `Tag` objects.

  byName(name: string): Tag | null;
  // Returns the first `Tag` contained directly in this array with the given name.
}

// Tags

declare class Tags extends TagArray {
  // An `Array` of tags at the top level of the database.

  apply(f: (tag: Tag) => ApplyResult | null): ApplyResult | null;
  // Calls the given function for each `Tag` in the `Library` and recursively into any child tags. The supplied function can optionally return a `ApplyResult` to skip enumeration of some elements.
  readonly beginning: Tag.ChildInsertionLocation;
  // Returns a location referring to the beginning of the top-level tags in the database.
  readonly ending: Tag.ChildInsertionLocation;
  // Returns a location referring to the ending of the top-level tags in the database.
}

// TaskArray

declare class TaskArray extends Array {
  // An `Array` containing `Task` objects.

  byName(name: string): Task | null;
  // Returns the first `Task` contained directly in this array with the given name.
}

// Inbox

declare class Inbox extends TaskArray {
  // An `Array` of tasks that are in the inbox.

  apply(f: (task: Task) => ApplyResult | null): ApplyResult | null;
  // Calls the given function for each `Task` in the `Inbox` and recursively into any child tasks. The supplied function can optionally return a `ApplyResult` to skip enumeration of some elements.
  readonly beginning: Task.ChildInsertionLocation;
  // A location that can be used when adding, duplicating, or moving tasks.
  readonly ending: Task.ChildInsertionLocation;
  // A location that can be used when adding, duplicating, or moving tasks.
}

// Audio

declare namespace Audio {
  function playAlert(alert?: Audio.Alert | null, completed?: () => void | null): void;
  // Play the specified `Audio.Alert`. On macOS, if no alert is specified, the user's default alert sound will be played. On iOS, there is no default alert sound and nothing will be done without specifying an alert.
}

declare class Audio {}

// Audio.Alert

declare namespace Audio {
  class Alert {
    constructor(url: URL);
  }
}

// Calendar

declare namespace Calendar {
  const buddhist: Calendar;
  const chinese: Calendar;
  const coptic: Calendar;
  const current: Calendar; // The user's preferred calendar
  const ethiopicAmeteAlem: Calendar;
  const ethiopicAmeteMihret: Calendar;
  const gregorian: Calendar; // The Gregorian calendar.
  const hebrew: Calendar;
  const indian: Calendar;
  const islamic: Calendar;
  const islamicCivil: Calendar;
  const islamicTabular: Calendar;
  const islamicUmmAlQura: Calendar;
  const iso8601: Calendar;
  const japanese: Calendar;
  const persian: Calendar;
  const republicOfChina: Calendar;
}

declare class Calendar {
  dateByAddingDateComponents(date: Date, components: DateComponents): Date | null;
  // Returns a new `Date` by adding the given `DateComponents`, or null if no date could be calculated.
  dateFromDateComponents(components: DateComponents): Date | null;
  // Returns a new `Date` from the given `DateComponents`, or null if no date could be calculated.
  dateComponentsFromDate(date: Date): DateComponents;
  // Returns a new `DateComponents` for the given `Date`.
  dateComponentsBetweenDates(start: Date, end: Date): DateComponents;
  // Returns the difference from the start `Date` to the end `Date` as a `DateComponents`.
  startOfDay(date: Date): Date;
  // Returns a `Date` for the first moment of the day containing the given `Date` according to this `Calendar`.
  readonly identifier: string; // The ISO identifier for the calendar.
  readonly locale: Locale | null; // The locale of the calendar.
  readonly timeZone: TimeZone; // The time zone of the calendar.
}

// Color

declare namespace Color {
  function RGB(r: number, g: number, b: number, a?: number | null): Color;
  // Makes a new color in the `RGB` colorspace, with the given components. If the alpha component is not given, 1.0 is used.
  function hex(hexString: string, a?: number | null): Color | null;
  // Makes a new color in the `RGB` colorspace from the provided hexadecimal string. If the alpha component is not provided, 1.0 is used.
  function HSB(h: number, s: number, b: number, a?: number | null): Color;
  // Makes a new color in the `HSB` colorspace, with the given components. If the alpha component is not given, 1.0 is used.
  function White(w: number, a?: number | null): Color;
  // Makes a new color in the `White` colorspace, with the given components. If the alpha component is not given, 1.0 is used.
  const black: Color;
  // A color in the `White` colorspace with white component of 0.0.
  const blue: Color;
  // A color in the `RGB` colorspace with components (0, 0, 1, 1).
  const brown: Color;
  // A color in the `RGB` colorspace with components (0.6, 0.4, 0.2, 1).
  const clear: Color;
  // A color in the `White` colorspace with white component of 0.0 and alpha of 0.0 ("transparent black").
  const cyan: Color;
  // A color in the `RGB` colorspace with components (0, 1, 1, 1).
  const darkGray: Color;
  // A color in the `White` colorspace with white component of 0.333.
  const gray: Color;
  // A color in the `White` colorspace with white component of 0.5.
  const green: Color;
  // A color in the `RGB` colorspace with components (0, 1, 0, 1).
  const lightGray: Color;
  // A color in the `White` colorspace with white component of 0.667.
  const magenta: Color;
  // A color in the `RGB` colorspace with components (1, 0, 1, 1).
  const orange: Color;
  // A color in the `RGB` colorspace with components (1, 0.5, 0, 1).
  const purple: Color;
  // A color in the `RGB` colorspace with components (1, 0, 1, 1).
  const red: Color;
  // A color in the `RGB` colorspace with components (1, 0, 0, 1).
  const white: Color;
  // A color in the `White` colorspace with white component of 1.0.
  const yellow: Color;
  // A color in the `RGB` colorspace with components (1, 1, 0, 1).
}

declare class Color {
  blend(otherColor: Color, fraction: number): Color | null;
  // Returns a new color that is a linear combination of the receiver and `fraction` of the other color (so, a fraction of 1.0 would just return the `otherColor`. If the colors cannot be blended (for example, if they cannot be converted to the same colorspace), then `null` is returned.
  readonly alpha: number;
  // Returns the alpha component of the color.
  readonly blue: number;
  // Returns the blue component of the color, after converting to an `RGB` colorspace.
  readonly brightness: number;
  // Returns the brightness component of the color, after converting to an `HSB` colorspace.
  readonly colorSpace: ColorSpace;
  // Returns the colorspace of the instance.
  readonly green: number;
  // Returns the green component of the color, after converting to an `RGB` colorspace.
  readonly hex: string;
  // Returns a 6-character hexadecimal string for the color, after converting to an `RGB` colorspace (ignoring alpha).
  readonly hue: number;
  // Returns the hue component of the color, after converting to an `HSB` colorspace.
  readonly red: number;
  // Returns the red component of the color, after converting to an `RGB` colorspace.
  readonly saturation: number;
  // Returns the saturation component of the color, after converting to an `HSB` colorspace.
  readonly white: number;
  // Returns the white component of the color, after converting to a `White` colorspace.
}

// ColorSpace

declare namespace ColorSpace {
  const CMYK: ColorSpace;
  // A colorspace with cyan, magenta, yellow, black, and alpha components.
  const HSB: ColorSpace;
  // A colorspace with hue, saturation, and value (or brightness) components.
  const Named: ColorSpace;
  // A space for named colors, like system defined colors, or specific color palette spaces.
  const Pattern: ColorSpace;
  // A colorspace that wraps a pattern image.
  const RGB: ColorSpace;
  // The sRGB colorspace with red, green, blue, and alpha components.
  const White: ColorSpace;
  // A colorspace with white and alpha components.
  const all: Array<ColorSpace>;
}

declare class ColorSpace {}

// CombinedValues

declare class CombinedValues {
  // CombinedValues is used as the object of a tree node in perspectives that group by a combined set of objects (currently only Tags).

  readonly name: string; // The name displayed for this group.
  readonly values: Array<Object>; // The values included in the group.
}

// Console

declare class Console {
  // The `Console` allows scripts to log debugging, warning, or error information where it can be viewed in the system console or in the console output area. A single instance of `Console` is available to scripts as the `console` global variable.

  log(message: Object, additional: Array<Object | null>): void;
  // Appends a line to the application console formed by concatenating the given `message` (after converting it to a `String`), any additional arguments separated by spaces, and finally a newline.
  error(message: Object, additional: Array<Object | null>): void;
  info(message: Object, additional: Array<Object | null>): void;
  warn(message: Object, additional: Array<Object | null>): void;
  // Just calls `Console.log`, currently.
  clear(): void;
  // Clears the console in the user-visible window.
}

// Credentials

declare class Credentials {
  // The `Credentials` class allows storage of private username and password pairs, `URL.Bookmark` instances, and possibly other sensitive information in the future. Instances are tied to a single plug-in and single application, and may only be created in plug-ins when they are being loaded.
  // For example, when a `PlugIn.Action` is being created, you could use the following pattern:
  // ```
  // (() => {
  //     let credentials = new Credentials();
  //     var action = new PlugIn.Action(function(selection) {
  //         // ... use the captured credentials ...
  //     });
  //     return action;
  // })();
  // ```
  // Attempts to create `Credential` instances elsewhere will throw an error. Care should be taken to store instances in anonymous closures as above, and not pass them to or store them on other objects.
  // Credentials are keyed off a service identifier, which your plug-in can define however it likes.

  constructor();
  // Creates a new `Credentials` instance for the currently loading plug-in. Throws an error if called outside of plug-in loading.
  read(service: string): object | null;
  // Looks up the current credentials for a given service identifier. If credentials have previously been stored, an object will be returned containing `"user"` an `"password"` properties.
  write(service: string, username: string, password: string): void;
  // Creates or updates an existing credential, storing the username and password for this service securely in the Keychain.
  remove(service: string): void;
  // Deletes any currently stored credentials  for the specified service, either a username and password or a URL bookmark.
  readBookmark(service: string): URL.Bookmark | null;
  // Reads the entry for the given service identifier and attempts to return it as a `URL.Bookmark`, or `null` if no such entry exists.
  writeBookmark(service: string, bookmark: URL.Bookmark): void;
  // Stores the `URL.Bookmark` persistently for later access.
}

// Crypto

declare namespace Crypto {
  function randomData(length: number): Data;
  // Copy `length` bytes of cryptographically secure random data.
}

declare class Crypto {
  // `Crypto` provides access to some of Apple's [CryptoKit](https://developer.apple.com/documentation/cryptokit)
}

// Crypto.SHA256

declare namespace Crypto {
  class SHA256 {
    // The SHA-256 hash function.
    constructor();
    // Create a new SHA-256 digest.
    update(data: Data): void;
    // Incrementally update the digest with the given data.
    finalize(): Data;
    // Finalize any remaining digest process and return the result of the hash function.
  }
}

// Crypto.SHA384

declare namespace Crypto {
  class SHA384 {
    // The SHA-384 hash function.
    constructor();
    // Create a new SHA-384 digest.
    update(data: Data): void;
    // Incrementally update the digest with the given data.
    finalize(): Data;
    // Finalize any remaining digest process and return the result of the hash function.
  }
}

// Crypto.SHA512

declare namespace Crypto {
  class SHA512 {
    // The SHA-512 hash function.
    constructor();
    // Create a new SHA-512 digest.
    update(data: Data): void;
    // Incrementally update the digest with the given data.
    finalize(): Data;
    // Finalize any remaining digest process and return the result of the hash function.
  }
}

// Data

declare namespace Data {
  function fromString(string: string, encoding?: StringEncoding | null): Data;
  // Convert the string to a `Data` using the given encoding, or UTF8 if none is specified.
  function fromBase64(string: string): Data;
}

declare class Data {
  // A generic bag of bytes. Mainly useful to be interpreted / converted to some other type.

  toString(encoding?: StringEncoding | null): string;
  // Convert to a `String`, assuming that this `Data` using the specified encoding, or UTF8 if none is given.
  toBase64(): string;
  // Convert to a Base-64 encoded string.
  readonly length: number; // Number of bytes in this data.
  readonly toObject: Object | null;
}

// Database

declare class Database {
  objectForURL(url: URL): DatabaseObject | null;
  // Returns the `DatabaseObject` for the given URL, if it exists.
  tagNamed(name: string): Tag | null;
  // Returns the first top-level `Tag` with the given name, or `null`.
  folderNamed(name: string): Folder | null;
  // Returns the first top-level `Folder` with the given name, or `null`.
  projectNamed(name: string): Project | null;
  // Returns the first top-level `Project` with the given name, or `null`.
  projectsMatching(search: string): Array<Project>;
  // Returns each existing `Project` that Smart Matches the given `search`. The result will be in the same order and have the same projects as would be found when searching this string in the Quick Open window.
  foldersMatching(search: string): Array<Folder>;
  // Returns each existing `Folder` that Smart Matches the given `search`. The result will be in the same order and have the same folders as would be found when searching this string in the Quick Open window.
  tagsMatching(search: string): Array<Tag>;
  // Returns each existing `Tag` that Smart Matches the `search`. The result will be in the same order and have the same tags as would be found when searching this string in the Quick Open window.
  taskNamed(name: string): Task | null;
  // Returns the first top-level `Task` in the inbox with the given name, or `null`.
  save(): void;
  // Saves any unsaved changes to disk. If sync is enabled and there were unsaved changes, this also triggers a sync request.
  moveTasks(tasks: Array<Task>, position: Project | Task | Task.ChildInsertionLocation): void;
  // Moves tasks to a different location.
  duplicateTasks(tasks: Array<Task>, position: Project | Task | Task.ChildInsertionLocation): TaskArray;
  // Makes copies of the tasks and returns the new copies. The order of the inputs is not considered and the copies are returned in library order of the originals.
  convertTasksToProjects(tasks: Array<Task>, position: Folder | Folder.ChildInsertionLocation): Array<Project>;
  // Converts tasks to new projects at the specified location.
  // For example, to convert each top-level inbox item into a new project at the end of your library and capture the resulting projects:
  // ```
  // const newProjects = convertTasksToProjects(inbox, library.ending);
  // ```
  moveSections(sections: Array<Project | Folder>, position: Folder | Folder.ChildInsertionLocation): void;
  // Moves sections to a different location.
  duplicateSections(sections: Array<Project | Folder>, position: Folder | Folder.ChildInsertionLocation): SectionArray;
  // Makes copies of the sections and returns the new copies. The order of the inputs is not considered and the copies are returned in library order of the originals.
  moveTags(tags: Array<Tag>, position: Tag | Tag.ChildInsertionLocation): void;
  // Moves tags to a different location.
  duplicateTags(tags: Array<Tag>, position: Tag | Tag.ChildInsertionLocation): TagArray;
  // Makes copies of the tags and returns the new copies. The order of the inputs is not considered and the copies are returned in library order of the originals.
  cleanUp(): void;
  // Processes inbox items that have the required information to move into their proposed containers, performs any delayed filtering, and deletes empty items.
  undo(): void;
  // Undoes the last undoable action, or throws an error if there are no undoable actions.
  redo(): void;
  // Redoes the next redoable action, or throws an error if there are no redoable actions.
  deleteObject(object: DatabaseObject): void;
  // Removes the object from the Database.
  copyTasksToPasteboard(tasks: Array<Task>, pasteboard: Pasteboard): void;
  // Copies the given tasks to the pasteboard in a variety of formats.
  canPasteTasks(pasteboard: Pasteboard): boolean;
  // Returns true if the pasteboard contains a type that can be imported as tasks.
  pasteTasksFromPasteboard(pasteboard: Pasteboard): Array<Task>;
  // Reads the most relevant pasteboard type and imports them as tasks. The tasks should then be moved to the desired destination.
  readonly app: Application; // Returns the shared `Application`.
  readonly baseStyle: Style;
  // Returns a base `Style` suitable for creating new `Text` instances.
  readonly canRedo: boolean;
  // Returns true if there are redoable actions.
  readonly canUndo: boolean;
  // Returns true if there are undoable actions.
  readonly console: Console; // Returns the shared `Console`.
  readonly document: DatabaseDocument | null;
  readonly flattenedFolders: FolderArray;
  // Returns a flat array of all folders in the database, sorted by their order in the database.
  readonly flattenedProjects: ProjectArray;
  // Returns a flat array of all projects in the database, sorted by their order in the database.
  readonly flattenedSections: SectionArray;
  // Returns a flat array of all folders and project in the database, sorted by their order in the database.
  readonly flattenedTags: TagArray;
  // Returns a flat array of all tags in the database, sorted by their order in the database.
  readonly flattenedTasks: TaskArray;
  // Returns a flat array of all tasks in the database, including inbox items, root tasks for projects, task groups and individual tasks. Tasks are sorted by their order in the database, with the inbox preceeding the library.
  readonly folders: FolderArray;
  // Returns the top-level folders in the database.
  readonly inbox: Inbox;
  // Returns a copy of the `Task`s currently in the inbox.
  readonly library: Library;
  // Returns the top-level folders and projects in the database.
  readonly projects: ProjectArray;
  // Returns the top-level folders in the database.
  readonly settings: Settings;
  readonly tags: Tags;
  // Returns the top-level tags in the database.
}

// Database.Fetch

declare namespace Database {
  class Fetch {
    readonly type: Database.Fetch.Type;
  }
}

// Database.Fetch.Type

declare namespace Database.Fetch.Type {
  const Inbox: Database.Fetch.Type;
  // The inbox in a project-base perspective.
  const Other: Database.Fetch.Type; // Some other fetch.
  const Untagged: Database.Fetch.Type;
  // The untagged tasks in a tag-based perspective.
  const all: Array<Database.Fetch.Type>;
}

declare namespace Database.Fetch {
  class Type {}
}

// DatabaseObject

declare class DatabaseObject {
  readonly id: ObjectIdentifier;
  // Returns the identifier for this object.
  readonly url: URL | null;
  // Returns a URL which links to this object, if one exists
}

// DatedObject

declare class DatedObject extends DatabaseObject {
  added: Date | null;
  // Returns the date the object was first saved. If the object is newly inserted, this will be `null`. For newly inserted objects, the `added` property may be set (but once an object is saved for the first time, the property is read-only).
  modified: Date | null;
  // Returns the date the object was most recently modified. If the object is newly inserted, this will be `null`. For newly inserted objects, the `modified` property may be set (but once an object is saved for the first time, the property is read-only).
}

// ActiveObject

declare class ActiveObject extends DatedObject {
  active: boolean;
  // If `true`, then this object is considered active, otherwise the object is considered dropped.
  readonly effectiveActive: boolean;
  // Returns `true` if this object and all its containers are active.
}

// Folder

declare namespace Folder {
  function byIdentifier(identifier: string): Folder | null;
  // Returns the `Folder` with the specified identifier, or `null` if no such folder exists.
}

declare class Folder extends ActiveObject {
  constructor(name: string, position?: Folder | Folder.ChildInsertionLocation | null);
  folderNamed(name: string): Folder | null;
  // Returns the first child `Folder` with the given name that is contained directly in this folder, or `null`.
  projectNamed(name: string): Project | null;
  // Returns the first child `Project` of this folder with the given name, or `null`.
  sectionNamed(name: string): Project | Folder | null;
  // Returns the first child `Folder` or `Project` in this folder with the given name, or `null`.
  childNamed(name: string): Project | Folder | null;
  // An alias for `sectionNamed`.
  apply(f: (folder: Folder) => ApplyResult | null): ApplyResult | null;
  // Calls the given function for this `Folder` and recursively into any child folders and projects. The tasks within any projects are not included. The supplied function can optionally return a `ApplyResult` to skip enumeration of some elements.
  readonly after: Folder.ChildInsertionLocation;
  // Returns a location referring to the position just after this folder within its containing `Folder` or `Database`.
  readonly before: Folder.ChildInsertionLocation;
  // Returns a location referring to the position just before this folder within its containing `Folder` or `Database`.
  readonly beginning: Folder.ChildInsertionLocation;
  // Returns a location referring to the the beginning of the contained projects and folders in this folder.
  readonly children: SectionArray; // An alias for `sections`.
  readonly ending: Folder.ChildInsertionLocation;
  // Returns a location referring to the the ending of the contained projects and folders in this folder.
  readonly flattenedChildren: SectionArray; // An alias for `flattenedSections`.
  readonly flattenedFolders: FolderArray;
  // Returns a flat array of all folders in this folder, sorted by their order in the database.
  readonly flattenedProjects: ProjectArray;
  // Returns a flat array of all projects in this folder, sorted by their order in the database.
  readonly flattenedSections: SectionArray;
  // Returns a flat array of all folders and project in this folder, sorted by their order in the database.
  readonly folders: FolderArray;
  // Returns the folders contained directly as children of this folder.
  name: string; // The name of the folder.
  readonly parent: Folder | null;
  // The parent `Folder` which contains this folder.
  readonly projects: ProjectArray;
  // Returns the projects contained directly as children of this folder.
  readonly sections: SectionArray;
  // Returns a sorted list of the folders and projects contained directly within this folder.
  status: Folder.Status; // The folder's status.
}

// Tag

declare namespace Tag {
  function byIdentifier(identifier: string): Tag | null;
  // Returns the `Tag` with the specified identifier, or `null` if no such tag exists.
  const forecastTag: Tag | null; // The Forecast Tag, if it is set.
}

declare class Tag extends ActiveObject {
  constructor(name: string, position?: Tag | Tag.ChildInsertionLocation | null);
  tagNamed(name: string): Tag | null;
  // Returns the first child `Tag` with the given name that is contained directly in this tag, or `null`.
  childNamed(name: string): Tag | null;
  // An alias for `tagNamed`.
  beforeTask(task?: Task | null): Tag.TaskInsertionLocation;
  // Returns a location indicating the position before an existing task in the `Tag`'s tasks. If no peer `Task` is specified, or the the specified task is not in the tag's tasks, this is equivalent to `beginningOfTasks`.
  afterTask(task?: Task | null): Tag.TaskInsertionLocation;
  // Returns a location indicating the position after an existing task in the `Tag`'s tasks. If no peer `Task` is specified, or the the specified task is not in the tag's tasks, this is equivalent to `endingOfTasks`.
  moveTask(task: Task, location: Tag.TaskInsertionLocation): void;
  // Moves an existing associated `Task` within the tag's list of tasks. If the task is not associated with the tag, no change is made.
  moveTasks(tasks: Array<Task>, location: Tag.TaskInsertionLocation): void;
  // Moves a list of associated `Task`s within the tag's list of tasks. Any tasks not currently associated with the tag are ignored.
  apply(f: (tag: Tag) => ApplyResult | null): ApplyResult | null;
  // Calls the given function for this `Tag` and recursively into any child tags. The supplied function can optionally return a `ApplyResult` to skip enumeration of some elements.
  readonly after: Tag.ChildInsertionLocation;
  // Returns a location referring to the position just after this tag.
  allowsNextAction: boolean;
  // If set and the tag is active, tasks with this tag applied cannot be the next task of a project.
  readonly availableTasks: TaskArray;
  // Returns a sorted list of the tasks associated with this tag that are currently available. Recent changes may not be reflected until a `cleanUp` is performed on the database.
  readonly before: Tag.ChildInsertionLocation;
  // Returns a location referring to the position just before this tag.
  readonly beginning: Tag.ChildInsertionLocation;
  // Returns a location referring to the beginning of the contained tags in this tag.
  readonly beginningOfTasks: Tag.TaskInsertionLocation;
  // Returns a location indicating the position before all of the `Tag`s tasks.
  readonly children: TagArray; // An alias for `tags`.
  childrenAreMutuallyExclusive: boolean;
  // If set, only one tag from among this group can be assigned to a `Task` at a time; when an additional tag from this group is assigned, the previously assigned tag is removed.
  readonly ending: Tag.ChildInsertionLocation;
  // Returns a location referring to the ending of the contained tags in this tag.
  readonly endingOfTasks: Tag.TaskInsertionLocation;
  // Returns a location indicating the position after all of the `Tag`s tasks.
  readonly flattenedChildren: TagArray; // An alias for `flattenedTags`.
  readonly flattenedTags: TagArray;
  // Returns a flat array of all tags contained within this tag. Tags are sorted by their order in the database.
  name: string;
  readonly parent: Tag | null;
  // The parent `Tag` which contains this tag.
  readonly projects: ProjectArray;
  // A convenience property that returns only `Project`s for the root tasks associated with this `Tag`.
  readonly remainingTasks: TaskArray;
  // Returns a sorted list of the tasks associated with this tag that remaing to be completed. Recent changes may not be reflected until a `cleanUp` is performed on the database.
  status: Tag.Status;
  // The current status of the tag as a whole, which is derived from `allowsNextAction` and `active`.
  readonly tags: TagArray;
  // Returns a sorted list of the tags contained directly within this tag, sorted by their library order.
  readonly tasks: TaskArray;
  // Returns a sorted list of the tasks associated with this tag.
}

// Task

declare namespace Task {
  function byParsingTransportText(text: string, singleTask?: boolean | null): Array<Task>;
  // Returns an array of tasks by parsing the transport text formatted input. Optionally, only the first task can be requested (but will still be returned in an array).
  function byIdentifier(identifier: string): Task | null;
  // Returns the `Task` with the specified identifier, or `null` if no such task exists.
}

declare class Task extends ActiveObject {
  constructor(name: string, position?: Project | Task | Task.ChildInsertionLocation | null);
  // Returns a new `Task` at the given location. If a project or task is given as a location, the new task is placed at the end of the children of that parent. If no location is specified, then the task is created at the end of the inbox.
  taskNamed(name: string): Task | null;
  // Returns the first child `Task` with the given name that is contained directly in this task, or `null`.
  childNamed(name: string): Task | null;
  // An alias for `taskNamed`.
  appendStringToNote(stringToAppend: string): void;
  // Appends `stringToAppend` to the end of the `Task`'s `note`.
  addLinkedFileURL(url: URL): void;
  // Links a file URL to this task. In order to be considered a file URL, `url` must have the `file` scheme. That is, `url` must be of the form `file://path-to-file`. The file at `url` will not be added to database, rather a bookmark leading to it will be added. In order to add files to a task, use the `addAttachment` function. Linking files is especially useful for large files, as including large files in the database can degrade app performance.
  removeLinkedFileWithURL(url: URL): void;
  // Removes the first link to a file with the given `url`. This removes the bookmark that leads to the file at `url`. If the file itself is present in the database, use the `removeAttachmentAtIndex` function instead.
  addAttachment(attachment: FileWrapper): void;
  // Adds `attachment` as an attachment to the task. If the attachment is large, consider using the `addLinkedFileURL` function instead. Including large attachments in the database can degrade app performance.
  removeAttachmentAtIndex(index: number): void;
  // Removes the attachment at `index` from this task's `attachments` array.
  beforeTag(tag?: Tag | null): Task.TagInsertionLocation;
  // Returns a location indicating the position before an existing tag in the `Task`'s tags. If no peer `Tag` is specified, or the the specified tag is not in the task's tags, this is equivalent to `beginningOfTags`.
  afterTag(tag?: Tag | null): Task.TagInsertionLocation;
  // Returns a location indicating the position after an existing tag in the `Task`'s tags. If no peer `Tag` is specified, or the the specified tag is not in the task's tags, this is equivalent to `endingOfTags`.
  addTag(tag: Tag, location?: Task.TagInsertionLocation | null): void;
  // Adds a `Tag` to this task at the specified location relative to its other tags, or at the end if no location is specified. If the tag is already present, no change is made. The `Database` function `moveTags` can be used to control the ordering of tags within the task.
  addTags(tags: Array<Tag>, location?: Task.TagInsertionLocation | null): void;
  // Adds multiple `Tag`s to this this task at the specified location relative to its other tags, or at the end if no location is specified.. For any tags already associated with the `Task`, no change is made. The `Database` function `moveTags` can be used to control the ordering of tags within the task.
  moveTag(tag: Tag, location: Task.TagInsertionLocation): void;
  // Moves an existing associated `Tag` within the task's list of tags. If the tag is not associated with the task, no change is made.
  moveTags(tags: Array<Tag>, location: Task.TagInsertionLocation): void;
  // Moves a list of associated `Tag`s within the task's list of tags. Any tags not currently associated with the task are ignored.
  removeTag(tag: Tag): void;
  // Removes a `Tag` from this task. If the tag is not associated with this task, no change is made.
  removeTags(tags: Array<Tag>): void;
  // Removes multiple `Tag`s from this task. If a tag is not associated with this task, no change is made.
  clearTags(): void;
  // Removes multiple `Tag`s from this task. If a tag is not associated with this task, no change is made.
  markComplete(date?: Date | null): Task;
  // If the task is not completed, marks it as complete with the given completion date (or the current date if no date is specified). For repeating tasks, this makes a clone of the task and marks that clone as completed. In either case, the task that has been marked completed is returned.
  markIncomplete(): void;
  // If the task is completed, marks it as incomplete.
  drop(allOccurrences: boolean, dateDropped?: Date | null): void;
  // Drops this `Task`. If true is passed in for `allOccurrences` then this task will not repeat, even if it has a `repititionRule` set on it. If false is passed in for `allOccurrences`, this task will repeat as normal. If `dateDropped` is specified, it will be used as the drop date.
  apply(f: (task: Task) => ApplyResult | null): ApplyResult | null;
  // Calls the given function for this `Task` and recursively into any child task. The supplied function can optionally return a `ApplyResult` to skip enumeration of some elements.
  addNotification(info: number | Date): Task.Notification;
  // Add a notification from the specification in `info`. Supplying a `Date` creates an absolute notification that will fire at that date. Supplying a `Double` will create a due-relative notification. Specifying a due relative notification when this task's effectiveDueDate is not set will result in an error.
  removeNotification(notification: Task.Notification): void;
  // Remove an active notification for this task. Supplying a notification that is not in this task's `notifications` array, or a notification that has `task` to something other than this task results in an error.
  readonly after: Task.ChildInsertionLocation;
  // The location after this task within its parent task's children. If this task has no parent task, then this is the position adjacent to it in its container.
  assignedContainer: Project | Task | Inbox | null;
  // For tasks in the inbox, the tentatively assigned project or parent task, which will be applied on cleanup.
  attachments: Array<FileWrapper>;
  // An array of `FileWrapper` objects representing the attachments associated with the task.
  readonly before: Task.ChildInsertionLocation;
  // The location before this task within its parent task's children. If this task has no parent task, then this is the position adjacent to it in its container.
  readonly beginning: Task.ChildInsertionLocation;
  // The location at the beginning of this task's children.
  readonly beginningOfTags: Task.TagInsertionLocation;
  // Returns a location indicating the position before all of the `Task`s tags.
  readonly children: TaskArray; // An alias for `tasks`.
  readonly completed: boolean;
  // True if the task has been marked completed. Note that a task may be effectively considered completed if a containing task is marked completed.
  completedByChildren: boolean;
  // If set, the Task will be automatically marked completed when its last child Task is marked completed.
  readonly completionDate: Date | null; // If set, the Task is completed.
  readonly containingProject: Project | null;
  // The `Project` that this `Task` is contained in, either as the root of the project or indirectly from a parent task. If this task is in the inbox, then this will be `null`.
  deferDate: Date | null;
  // If set, the Task is not actionable until this date.
  readonly dropDate: Date | null; // If set, the Task is dropped.
  dueDate: Date | null;
  // If set, the Task should be completed by this date.
  readonly effectiveCompletedDate: Date | null;
  // Deprecated: Please use the `effectiveCompletionDate` property instead.
  readonly effectiveCompletionDate: Date | null;
  // Returns the computed effective completion date for the `Task`, based on its local `completionDate` and those of its containers.
  readonly effectiveDeferDate: Date | null;
  // Returns the computed effective defer date for the `Task`, based on its local `deferDate` and those of its containers.
  readonly effectiveDropDate: Date | null;
  // Returns the computed effective drop date for the `Task`, based on its local `dropDate` and those of its containers.
  readonly effectiveDueDate: Date | null;
  // Returns the computed effective due date for the `Task`, based on its local `dateDue` and those of its containers.
  readonly effectiveFlagged: boolean;
  // Returns the computed effective flagged status for the `Task`, based on its local `flagged` and those of its containers.
  readonly effectivePlannedDate: Date | null;
  // Returns the computed effective planned date for the `Task`, based on its local `datePlanned` and those of its containers.
  readonly ending: Task.ChildInsertionLocation;
  // The location at the end of this task's children.
  readonly endingOfTags: Task.TagInsertionLocation;
  // Returns a location indicating the position after all of the `Task`s tags.
  estimatedMinutes: number | null;
  // The estimated number of minutes this task will take to finish, or `null` if no estimate has been made.
  flagged: boolean; // The flagged status of the task.
  readonly flattenedChildren: TaskArray; // An alias for `flattenedTasks`.
  readonly flattenedTasks: TaskArray;
  // Returns a flat array of all tasks contained within this task. Tasks are sorted by their order in the database.
  readonly hasChildren: boolean;
  // Returns `true` if this task has children, more efficiently than checking if `children` is empty.
  readonly inInbox: boolean;
  // True if the task is a direct child of the inbox, but not if the task is contained by another task that is in the inbox.
  readonly linkedFileURLs: Array<URL>;
  // The list of file URLs linked to this task. The files at these URLs are not present in the database, rather the database holds bookmarks leading to these files. These links can be read on iOS, but not written to.
  name: string; // The title of the task.
  note: string; // The task's note.
  noteText: Text;
  // The task's note as a rich `Text` object.
  readonly notifications: Array<Task.Notification>;
  // An array of the notifications that are active for this task.
  readonly parent: Task | null;
  // The parent `Task` which contains this task.
  plannedDate: Date | null;
  // If set, the intention is to work on this Task on its planned date. (Note: getting and setting this value requires that the database has been migrated to support planned dates.)
  readonly project: Project | null;
  // The `Project` that this `Task` is the root task of, or `null` if this task is in the inbox or contained by another task.
  repetitionRule: Task.RepetitionRule | null;
  // The object holding the repetition properties for this task, or null if it is not repeating.
  sequential: boolean;
  // If `true`, then children of this task form a dependency chain. For example, the first task blocks the second one until the first is completed.
  shouldUseFloatingTimeZone: boolean;
  // When set, the `dueDate` and `deferDate` properties will use floating time zones. (Note: if a `Task` has no due or defer dates assigned, this property will revert to the database's default setting.)
  readonly tags: TagArray;
  // Returns the `Tag`s associated with this `Task`.
  readonly taskStatus: Task.Status;
  // Returns the current status of the task.
  readonly tasks: TaskArray;
  // Returns all the tasks contained directly in this task, sorted by their library order.
}

// Perspective.Custom

declare namespace Perspective.Custom {
  function byName(name: string): Perspective.Custom | null;
  // A custom perspective with the given name, if one exists. If there are multiple perspectives with the same name, it is not defined which will be returned.
  function byIdentifier(identifier: string): Perspective.Custom | null;
  // Returns the custom perspective with the specified identifier, or `null` if no such perspective exists.
  const all: Array<Perspective.Custom>; // Returns all the custom perspectives.
}

declare namespace Perspective {
  class Custom extends DatedObject {
    fileWrapper(): FileWrapper;
    // Returns an archived file wrapper for the custom perspective. The file wrapper's preferred filename will be the name of the perspective with an appropriate file extension applied. Its contents will include a plist representing the perspective's settings, along with any image attachments needed to display its icon.
    writeFileRepresentationIntoDirectory(parentURL: URL): URL;
    // Writes the perspective's `fileWrapper()` within a given parent directory URL, returning the URL of the saved FileWrapper. This function requires sandboxed access to the parent folder; it may be easier to work with the perspective's `fileWrapper()`, which can be accessed directly or saved to disk using `FileSaver`.
    archivedFilterRules: Object;
    // For a custom perspective, `archivedFilterRules` holds a JSON archive representing the perspective's rules. These rules will be interpreted differently based on the `archivedTopLevelFilterAggregation` setting.
    archivedTopLevelFilterAggregation: string | null;
    // For a custom perspective, the `archivedTopLevelFilterAggregation` indicates which aggregation method is being used to interpret the `archivedFilterRules`: "all", "any", or "none"
    iconColor: Color | null;
    // The `Color` that is applied to the perspective icon symbol. (Does not apply when a perspective uses a custom icon.)
    readonly identifier: string;
    // The unique identifier of the custom perspective.
    name: string; // The name of the custom perspective.
  }
}

// Task.Notification

declare namespace Task {
  class Notification extends DatedObject {
    absoluteFireDate: Date;
    // The absolute date at which this notification will fire, if its `kind` is `absolute`. Getting or setting this property throws an error if this notification's `kind` is not `absolute`.
    readonly initialFireDate: Date;
    // The time at which this notification will fire. For due or defer-relative notifications, this date will change with its `task` object's due and defer dates.
    readonly isSnoozed: boolean;
    // Whether or not this notification has been snoozed.
    readonly kind: Task.Notification.Kind;
    // This notification's kind. A `kind` of `unknown` indicates that the notification is in an invalid state.
    readonly nextFireDate: Date | null;
    // The next time at which this notification will fire. This will only have a value if the `initialFireDate` is not yet reached, or this notification's `repeatInterval` is greater than 0.
    relativeFireOffset: number;
    // The relative offset in minutes at which this notification will fire from the specified date on its `task`. Getting or setting this property throws an error if this notification's `kind` is not either `dueRelative` or `deferRelative`.
    repeatInterval: number;
    // How often in seconds this notification will fire once its `initialFireDate` is reached. Setting this to 0 or any negative number will cease repetition of this notification.
    readonly task: Task | null;
    // The `Task` object this notification will fire for.
    readonly usesFloatingTimeZone: boolean;
    // Whether or not the notification's fire date uses floating time zones. This can only return true if the notification's `kind` is absolute`. This can be changed by setting `shouldUseFloatingTimeZone` on this notification's `task`
  }
}

// Project

declare namespace Project {
  function byIdentifier(identifier: string): Project | null;
  // Returns the `Project` with the specified identifier, or `null` if no such project exists.
}

declare class Project extends DatabaseObject {
  constructor(name: string, position?: Folder | Folder.ChildInsertionLocation | null);
  taskNamed(name: string): Task | null;
  // Returns the first top-level `Task` in this project the given name, or `null`.
  appendStringToNote(stringToAppend: string): void;
  // Appends `stringToAppend` to the end of the `Project`'s root `Task`'s `note`.
  addAttachment(attachment: FileWrapper): void;
  // Adds `attachment` as an attachment to the `Project`'s root `Task`. If the attachment is large, consider using the `addLinkedFileURL` function instead. Including large attachments in the database can degrade app performance.
  removeAttachmentAtIndex(index: number): void;
  // Removes the attachment at `index` from this `Project`'s root `Task`'s `attachments` array.
  markComplete(date?: Date | null): Task;
  // If the project is not completed, marks it as complete with the given completion date (or the current date if no date is specified). For repeating project, this makes a clone of the project and marks that clone as completed. In either case, the project that has been marked completed is returned.
  markIncomplete(): void;
  // If the project is completed, marks it as incomplete.
  addNotification(info: number | Date): Task.Notification;
  // Add a notification to the project from the specification in `info`. Supplying a `Date` creates an absolute notification that will fire at that date. Supplying a `Double` will create a due-relative notification. Specifying a due-relative notification when this project's `task`'s effectiveDueDate is not set will result in an error.
  removeNotification(notification: Task.Notification): void;
  // Remove an active notification for this project. Supplying a notification that is not in this task's `notifications` array, or a notification that has `task` to something other than this project's `task` results in an error.
  addTag(tag: Tag): void;
  // Adds a `Tag` to this project, appending it to the end of the list of associated tags. If the tag is already present, no change is made. The `Database` function `moveTags` can be used to control the ordering of tags within the task.
  addTags(tags: Array<Tag>): void;
  // Adds multiple `Tag`s to this project, appending them to the end of the list of associated tags. For any tags already associated with the `Task`, no change is made. The `Database` function `moveTags` can be used to control the ordering of tags within the task.
  removeTag(tag: Tag): void;
  // Removes a `Tag` from this project. If the tag is not associated with this project, no change is made.
  removeTags(tags: Array<Tag>): void;
  // Removes multiple `Tag`s from this project. If a tag is not associated with this project, no change is made.
  clearTags(): void;
  // Removes multiple `Tag`s from this project. If a tag is not associated with this project, no change is made.
  addLinkedFileURL(url: URL): void;
  // Links a file URL to this task. In order to be considered a file URL, `url` must have the `file` scheme. That is, `url` must be of the form `file://path-to-file`. The file at `url` will not be added to database, rather a bookmark leading to it will be added. In order to add files to a task, use the `addAttachment` function. Linking files is especially useful for large files, as including large files in the database can degrade app performance. This function throws an error if invoked on iOS.
  removeLinkedFileWithURL(url: URL): void;
  // Removes the first link to a file with the given `url`. This removes the bookmark that leads to the file at `url`. If the file itself is present in the database, use the `removeAttachmentAtIndex` function instead.
  readonly after: Folder.ChildInsertionLocation;
  // Returns a location referring to the position just after this project within its containing `Folder` or `Database`.
  attachments: Array<FileWrapper>;
  // An array of `FileWrapper` objects representing the attachments associated with the `Project`'s root `Task`.
  readonly before: Folder.ChildInsertionLocation;
  // Returns a location referring to the position just before this project within its containing `Folder` or `Database`.
  readonly beginning: Task.ChildInsertionLocation;
  // Returns a location referring to the position after the last `Task` directly contained in the root `task` of this project.
  readonly children: TaskArray; // An alias for `tasks`.
  readonly completed: boolean;
  // True if the project has been marked completed. Note that a project may be effectively considered completed if a containing project is marked completed.
  completedByChildren: boolean;
  // If set, the project will be automatically marked completed when its last child Task is marked completed.
  completionDate: Date | null; // If set, the project is completed.
  containsSingletonActions: boolean;
  // If set to `true`, the project contains single tasks, and has no next task.
  defaultSingletonActionHolder: boolean;
  // If set to `true`, this is the `Project` that inbox tasks that have enough information specified (as selected by the user's preferences) will be filed into upon a clean-up.
  deferDate: Date | null;
  // If set, the project is not actionable until this date.
  dropDate: Date | null; // If set, the project is dropped.
  dueDate: Date | null;
  // If set, the project should be completed by this date.
  readonly effectiveCompletedDate: Date | null;
  // Returns the computed effective completion date for the `Project`, based on its local `completionDate` and those of its containers.
  readonly effectiveDeferDate: Date | null;
  // Returns the computed effective defer date for the `Project`, based on its local `deferDate` and those of its containers.
  readonly effectiveDropDate: Date | null;
  // Returns the computed effective drop date for the `Project`, based on its local `dropDate` and those of its containers.
  readonly effectiveDueDate: Date | null;
  // Returns the computed effective due date for the `Project`, based on its local `dateDue` and those of its containers.
  readonly effectiveFlagged: boolean;
  // Returns the computed effective flagged status for the `Project`, based on its local `flagged` and those of its containers.
  readonly effectivePlannedDate: Date | null;
  // Returns the computed effective planned date for the `Project`, based on its local `datePlanned` and those of its containers.
  readonly ending: Task.ChildInsertionLocation;
  // Returns a location referring to the position before the first `Task` directly contained in the root `task` of this project.
  estimatedMinutes: number | null;
  // The estimated number of minutes this `Project` will take to finish, or `null` if no estimate has been made.
  flagged: boolean; // The flagged status of the project.
  readonly flattenedChildren: TaskArray; // An alias for `flattenedTasks`.
  readonly flattenedTasks: TaskArray;
  // Returns a flat array of all tasks contained within this `Project`'s root `Task`. Tasks are sorted by their order in the database.
  readonly hasChildren: boolean;
  // Returns `true` if this `Project`'s root `Task` has children, more efficiently than checking if `children` is empty.
  lastReviewDate: Date | null;
  // The date on which the last review was performed. See also `nextReviewDate`.
  readonly linkedFileURLs: Array<URL>;
  // The list of file URLs linked to this project's root task. The files at these URLs are not present in the database, rather the database holds bookmarks leading to these files. These links can be read on iOS, but not written to.
  name: string; // The name of the `Project`s root task.
  nextReviewDate: Date | null;
  // The scheduled date for the next review. See also `nextReviewDate`.
  readonly nextTask: Task | null;
  // Returns the very next task that can be completed in the project, or `null` if there is none or the project contains singleton actions.
  note: string; // The `Project`'s root `Task`'s note.
  noteText: Text;
  // The `Project`'s root `Task`'s note as a rich `Text` object.
  readonly notifications: Array<Task.Notification>;
  // An array of the notifications that are active for this project.
  readonly parentFolder: Folder | null;
  // The `Folder` which contains this project.
  plannedDate: Date | null;
  // If set, the intention is to work on this Project on its planned date. (Note: getting and setting this value requires that the database has been migrated to support planned dates.)
  repetitionRule: Task.RepetitionRule | null;
  // The object holding the repetition properties for this project, or null if it is not repeating.
  reviewInterval: Project.ReviewInterval;
  // The object holding the review repetition properties for this project. See also `lastReviewDate and `nextReviewDate`.
  sequential: boolean;
  // If `true`, then children of this project form a dependency chain. For example, the first task blocks the second one until the first is completed.
  shouldUseFloatingTimeZone: boolean;
  // When set, the `dueDate` and `deferDate` properties will use floating time zones. (Note: if a `Project` has no due or defer dates assigned, this property will revert to the database's default setting.)
  status: Project.Status;
  // The current status of the project as a whole. This does not reflect the status of individual tasks within the project root task -- a project may be marked with the `Done` status and its individual tasks will be left with the completion state they had, in case the status is changed again to `Active`.
  readonly tags: TagArray;
  // Returns the `Tag`s associated with this `Project`.
  readonly task: Task;
  // Returns the root task of the project, which holds the bulk of the project information, as well as being the container for tasks within the project. If you wish to copy the project or move it to a location that requires tasks, you would use this task as the object to be copied or moved.
  readonly taskStatus: Task.Status;
  // Returns the current status of the project.
  readonly tasks: TaskArray;
  // Returns all the tasks contained directly in this `Project`'s root `Task`, sorted by their library order.
}

// DateComponents

declare class DateComponents {
  constructor();
  readonly date: Date | null;
  day: number | null;
  era: number | null;
  hour: number | null;
  minute: number | null;
  month: number | null;
  nanosecond: number | null;
  second: number | null;
  timeZone: TimeZone | null;
  year: number | null;
}

// DateRange

declare class DateRange {
  readonly end: Date;
  readonly name: string;
  readonly start: Date;
}

// Decimal

declare namespace Decimal {
  function fromString(string: string): Decimal;
  // Parses the given string into a `Decimal`. If the string cannot be parsed, `notANumber` is returned.
  const maximum: Decimal;
  // Returns the maximum representable `Decimal` value.
  const minimum: Decimal;
  // Returns the minimum representable `Decimal` value.
  const notANumber: Decimal;
  // Returns a `Decimal` that represents a non-number value. Any arithmetic operations involving non-number values will return `notANumber`.
  const one: Decimal; // Returns a `Decimal` representing one.
  const zero: Decimal;
  // Returns a `Decimal` representing zero.
}

declare class Decimal {
  // The `Decimal` class provides support for operating on base-10 numbers, which may not be exactly representable by types like the built-in JavaScript `Number` class. Note that `Decimal` does not use the built-in arithmetic operations; for example, to add two `Decimal` instances, you must use the `add()` function.

  toString(): string;
  // Converts the `Decimal` to a `String` representation.
  add(number: Decimal): Decimal;
  // Generates a new `Decimal` by adding the argument and the receiver.
  subtract(number: Decimal): Decimal;
  // Generates a new `Decimal` by subtracting the argument from the receiver.
  multiply(number: Decimal): Decimal;
  // Generates a new `Decimal` by multiplying the argument and the receiver.
  divide(number: Decimal): Decimal;
  // Generates a new `Decimal` by dividing the receiver by the argument.
  compare(number: Decimal): number;
  // Compares the receiver and argument. If the receiver is less than the argument, -1 is returned. If the receiver is greater than the argument, 1 is returned. Otherwise, 0 is returned. `notANumber` is considered less than any valid number, and equal to itself.
  equals(number: Decimal): boolean;
  // Returns `true` if the receiver and argument represent the same number (or both are `notANumber`), and `false` otherwise.
}

// Device

declare namespace Device {
  const current: Device;
  // The device the current application is running on.
}

declare class Device {
  readonly iOS: boolean;
  // A convenience that returns `true` on iPhone and iPad devices.
  readonly iPad: boolean;
  // A convenience that returns `true` only on iPad devices, but not on iPhone devices.
  readonly mac: boolean;
  // A convenience that returns `true` only on Mac devices.
  readonly operatingSystemBuildNumber: string;
  // The build number for the current operating system version running on the device.
  readonly operatingSystemVersion: Version;
  // The current operation system version running on the device.
  readonly type: DeviceType | null;
  // The general type of the current device
  readonly visionPro: boolean;
  // A convenience that returns `true` only on Apple Vision Pro devices.
}

// DeviceType

declare namespace DeviceType {
  const all: Array<DeviceType>;
  const iPad: DeviceType; // An iPad
  const iPhone: DeviceType; // An iPhone
  const mac: DeviceType; // A Mac device
  const visionPro: DeviceType; // An Apple Vision Pro
}

declare class DeviceType {}

// Document

declare namespace Document {
  function makeNew(resultFunction?: (document: Document | Error) => void | null): Promise<Document>;
  // Create a new document, which can be populated with data and then presented. On iOS, if the document is not presented by the time the `resultFunction` returns, it will be closed. On macOS, the document will be left around and accessible to the running script. `resultFunction` is executed before any functions tethered to the result Promise are executed. Returns a `Promise` that will yield the new document or an error.
  function makeNewAndShow(resultFunction?: (document: Document | Error) => void | null): Promise<Document>;
  // Create a new document and presents it. Returns a `Promise` that will yield the new document or an error.
}

declare class Document {
  close(didCancel?: (document: Document) => void | null): void;
  // Close this document. If for some reason the document cannot be closed, the `didCancel` function may be called at some point in the future, with the original document as the single argument. For example, on the Mac the user may review unsaved changes and may cancel the close operation. If the document is closed, the `didCancel` function will not be called at all.
  save(): void;
  // Save this document.
  fileWrapper(type?: string | null): FileWrapper;
  // Deprecated: Please use `makeFileWrapper()` instead.
  // Returns a new `FileWrapper` representing the contents of the document formatted as the specified type, or its current `fileType` if a `null` is passed for the type.
  makeFileWrapper(baseName: string, type?: string | null): Promise<FileWrapper>;
  // Generates a `FileWrapper` representing the contents of the document formatted as the specified type, or its current `fileType` if a `null` is passed for the type. Returns a `Promise` that will yield the file wrapper or an error. The returned file wrapper will have a name based off the given `baseName` and the default path extension for the requested file type.
  undo(): void;
  // Undo the last done action.
  redo(): void;
  // Redo the last undone action.
  show(completed?: () => void | null): void;
  // Presents the document, ordering the window forward on macOS, and possibly closing the existing document and opening the new on on iOS. Calls the completion function once the document is shown.
  createOmniLinkURL(
    additionalQueryItems?: Array<URL.QueryItem> | null,
    additionalPromptMessage?: string | null,
  ): Promise<URL>;
  // Creates an Omni Link for the current document, with optional parameters for additional query items and prompt message text. Convenience cover for `URL.omniLinkForFileURL()`.
  readonly canRedo: boolean;
  // Whether there are currently any actions that can be redone.
  readonly canUndo: boolean;
  // Whether there are currently any actions that can be undone.
  readonly fileType: string | null;
  // The file type identifier the document uses when saving, if set.
  readonly fileURL: URL | null;
  // The location of the document's on-disk representation.
  readonly name: string | null; // Document name.
  readonly omniLink: URL | null;
  // The Omni Link for this document, when the document is already saved within a Connected Folder.
  readonly writableTypes: Array<string>;
  // A list of all of the file types that this document can be written as.
}

// DatabaseDocument

declare class DatabaseDocument extends Document {
  newWindow(): Promise<DocumentWindow>;
  // Returns a `Promise` that will yield either a newly created and displayed `Window` or an error. On macOS, this method respects the System Preference governing new window behavior (tab vs. window). That preference is accessible at `System Preferences` > `Dock` > `Prefer tabs when opening documents`.
  newTabOnWindow(window: DocumentWindow): Promise<DocumentWindow>;
  // Returns a `Promise` that will yield either a new tab adjacent to `window` or an error. This is not available on iOS.
  sync(): Promise<boolean>;
  // Returns a `Promise` that will yield either `true` indicating a successful sync, or an error.
  readonly windows: Array<DocumentWindow>;
}

// Email

declare class Email {
  // A set of parameters for generating an email.

  constructor();
  generate(): void;
  // Presents the generated email to the user for them to send (or discard). On iOS, any included attachment `FileWrapper`s that are directories will be converted to Zip files.
  blindCarbonCopy: string | Array<string> | null;
  body: string | null;
  carbonCopy: string | Array<string> | null;
  fileWrappers: Array<FileWrapper>;
  receiver: string | Array<string> | null;
  subject: string | null;
}

// FilePicker

declare class FilePicker {
  // A `FilePicker` allows the user to select `URL`s for files via the system-supplied file picking interface.

  constructor();
  // Returns a new `FilePicker` with default settings.
  show(): Promise<Array<URL>>;
  // Presents the system file selection interface to the user, allowing them to choose one or more files of the given types. The returned `Promise` will yield the chosen `URL`s on success. If the user cancels chosing, the `Promise` will be rejected. Note that even when picking a single file or folder, the result will be an array of `URL`s.
  folders: boolean;
  // If `true`, then folders may be selected, but not files. In this case, `types` is ignored. Defaults to `false`.
  message: string;
  // A message to display describing what files are being picked. This is currently only supported on macOS.
  multiple: boolean;
  // If `true`, then multiple files may be selected. Defaults to `false`.
  types: Array<TypeIdentifier> | null;
  // The file types that will be allowed. If `null`, all file types will be allowed. Defaults to `null`.
}

// FileSaver

declare class FileSaver {
  // A `FileSaver` allows the user to save a `FileWrapper` to a `URL`s via the system-supplied file picking interface.

  constructor();
  // Returns a new `FileSaver` with default settings.
  show(fileWrapper: FileWrapper): Promise<URL>;
  // Presents the system file saving interface to the user, allowing them to choose a location and file name to save the file wrapper. The returned `Promise` will yield the chosen `URL` on success. If the user cancels chosing, the `Promise` will be rejected.
  message: string;
  // A message to display describing what file is being saved. This is currently only supported on macOS.
  nameLabel: string;
  // The label shown next to the user-editable file name field. This is currently only supported on macOS.
  prompt: string;
  // The prompt shown on the the save button. This is currently only supported on macOS.
  types: Array<TypeIdentifier> | null;
  // The file types that will be allowed. If `null`, all file types will be allowed. Defaults to `null`.
}

// FileWrapper

declare namespace FileWrapper {
  function withContents(name: string | null, contents: Data): FileWrapper;
  // Returns a new `FileWrapper` that represents a flat file containing the given data.
  function withChildren(name: string | null, children: Array<FileWrapper>): FileWrapper;
  // Returns a new `FileWrapper` that represents a directory with the given child file wrappers. Each child file wrapper must have a unique name specified.
  function fromURL(url: URL, options?: Array<FileWrapper.ReadingOptions> | null): FileWrapper;
  // Reads a `FileWrapper` from an existing URL.
}

declare class FileWrapper {
  childNamed(name: string): FileWrapper | null;
  // Returns the child file wrapper with the specified name, or `null` if the receiver is not a directory or doesn't have a child with that name.
  filenameForChild(child: FileWrapper): string | null;
  // Returns the unique file name that will be used for the given child `FileWrapper`, or `null` if this file wrapper is not a child of the receiver.
  write(url: URL, options?: Array<FileWrapper.WritingOptions> | null, originalContentsURL?: URL | null): void;
  // Writes the `FileWrapper` to the given `URL`.
  // <span class="danger">NOTE: Any existing file or folder at the desination `URL` will be replaced. Care must be taken when developing scripts to avoid unintended data loss.</span>
  readonly children: Array<FileWrapper>;
  // Returns an `Array` of child `FileWrappers`, if this represents a directory. Otherwise, an empty array is returned.
  readonly contents: Data | null;
  // Returns the regular file contents of the wrapper, if this represents a regular file. Otherwise, `null` is returned.
  readonly destination: URL | null;
  // Returns the destination if this represents a symbolic link. Otherwise, `null` is returned.
  filename: string | null;
  // Returns the actual file name that was last read for this file wrapper. Depending on the names of other sibling wrappers, this may not be what file name will be written.
  preferredFilename: string | null;
  // Returns the preferred file name that should be used when writing the file wrapper if no other file in the same parent directory wrapper is in use.
  readonly type: FileWrapper.Type;
  // Returns the type of this `FileWrapper`.
}

// FileWrapper.ReadingOptions

declare namespace FileWrapper.ReadingOptions {
  const Immediate: FileWrapper.ReadingOptions;
  // Whether the contents are read immediately, or (by default) as the file wrappers are accessed.
  const WihtoutMapping: FileWrapper.ReadingOptions; // Allow disabling file mapping.
  const all: Array<FileWrapper.ReadingOptions>;
}

declare namespace FileWrapper {
  class ReadingOptions {}
}

// FileWrapper.Type

declare namespace FileWrapper.Type {
  const Directory: FileWrapper.Type;
  // A `FileWrapper` that represents a directory with zero or more child wrappers.
  const File: FileWrapper.Type;
  // A `FileWrapper` that represents a regular file with data contents.
  const Link: FileWrapper.Type;
  // A `FileWrapper` that represents a symbolic link to another location.
  const all: Array<FileWrapper.Type>;
}

declare namespace FileWrapper {
  class Type {}
}

// FileWrapper.WritingOptions

declare namespace FileWrapper.WritingOptions {
  const Atomic: FileWrapper.WritingOptions;
  // Write the entire `FileWrapper` atomically, so that either the entire file package is replaced or none of it is.
  const UpdateNames: FileWrapper.WritingOptions;
  // On successful writing, update the filename of each file wrapper recursively so that following writes can use performance optimizations using hard links.
  const all: Array<FileWrapper.WritingOptions>;
}

declare namespace FileWrapper {
  class WritingOptions {}
}

// Folder.ChildInsertionLocation

declare namespace Folder {
  class ChildInsertionLocation {
    // A location specified relative to an existing `Folder`, `Project`, or `Database`. These cannot be instantiated directly, rather they are returned from properties like `Folder.beginning`, `Project.before`, or `Database.ending`.
  }
}

// Folder.Status

declare namespace Folder.Status {
  const Active: Folder.Status; // The folder is active.
  const Dropped: Folder.Status; // The folder has been dropped.
  const all: Array<Folder.Status>;
}

declare namespace Folder {
  class Status {}
}

// ForecastDay

declare namespace ForecastDay {
  let badgeCountsIncludeDeferredItems: boolean;
  // Determines whether or not badges on Forecast days include items that are not yet available.
}

declare class ForecastDay {
  // An object representing one of the selectable days in the forecast perspective.

  badgeKind(): ForecastDay.Status;
  // The status of the badge on this forecast day.
  readonly badgeCount: number;
  // The number of available tasks on this forecast day.
  readonly date: Date;
  // The date this forecast day represents. If this day's kind is `Past` or `DistantFuture` the date returned will be years from the current time.
  readonly deferredCount: number;
  // The number of remaining deferred tasks on this forecast day.
  readonly kind: ForecastDay.Kind;
  readonly name: string;
}

// ForecastDay.Kind

declare namespace ForecastDay.Kind {
  const Day: ForecastDay.Kind;
  // The node represents a specific day in the Forecast week or month grid.
  const DistantFuture: ForecastDay.Kind;
  // The node represents all days more than a year from now.
  const FutureMonth: ForecastDay.Kind;
  // The node represents a month within the next year.
  const Past: ForecastDay.Kind;
  // The node represents all days in the past.
  const Today: ForecastDay.Kind; // The node represents today.
  const all: Array<ForecastDay.Kind>;
}

declare namespace ForecastDay {
  class Kind {}
}

// ForecastDay.Status

declare namespace ForecastDay.Status {
  const Available: ForecastDay.Status;
  // There is at least one available task on the node's day, but no task is due soon or overdue. The node's badgeCount is the number of available tasks.
  const DueSoon: ForecastDay.Status;
  // There is at least one available task on the node's day, and at least one task due that day is due soon, but no tasks due that day are overdue. The node's badgeCount is the number of available tasks.
  const NoneAvailable: ForecastDay.Status;
  // There are no available tasks on the node's day. The node's badgeCount is guaranteed to be zero.
  const Overdue: ForecastDay.Status;
  // There is at least one available task on the node's day, and at least one task due that day is overdue. The node's badgeCount is the number of available tasks.
  const all: Array<ForecastDay.Status>;
}

declare namespace ForecastDay {
  class Status {}
}

// Form

declare class Form {
  // `Form` provides a mechanism to collect input from the user. Each form contains one or more instances of subclasses of `Field`, which are given a key. As the form is filled out, `values` object is populated with the values from the user interface.

  constructor();
  addField(field: Form.Field, index?: number | null): void;
  // Adds the new `Field` to the `Form`, at the indicated position, or at the end if no position is specified. If the field has a default value, it will be added to the `values` result object immediately.
  removeField(field: Form.Field): void;
  // Removes the `Field from the `Form`. Any entry in the `values` for this field will be removed as well.
  show(title: string, confirmTitle: string): Promise<Form>;
  // Present the `Form` to the user, and return a `Promise` to be fullfilled or rejected when the user commits or cancels the form.
  readonly fields: Array<Form.Field>;
  // The current `Field` instances in the form, which will be visible to the user entering input.
  validate: (Form: Form) => boolean | null;
  // A function to check whether the entered values are acceptable. The form to validate is passed as the argument and the function is expected to return a boolean result or null to perform default validation. If an `Error` is thrown, it's message will be displayed in the form as the reason for validation failure. Note that the validation function may add or remove fields and update entries in the `values` object (which will cause the interface to be updated). This is called any time the user edits values, or a field is added or removed. If no `validate` function is specified or it returns `null`, some per-field default validation will be performed (see `Form.Field.Option`. If the `validate` function returns a boolean result, no default validation will be performed.
  readonly values: Object;
  // An object with the collected values for each field, stored under the key for that field.
}

// Form.Field

declare namespace Form {
  class Field {
    // A single entry for a user input value in a `Form`. Each field can only be added to a single `Form`. This class cannot be constructed directly.
    readonly displayName: string | null;
    // Human readable string used as the label for this field.
    readonly key: string;
    // Key to use when storing the value for this field in the containing form's `values` object.
  }
}

// Form.Field.Checkbox

declare namespace Form.Field {
  class Checkbox extends Form.Field {
    constructor(key: string, displayName?: string | null, value?: boolean | null);
    // Returns a new `Checkbox` field, optionally with an initial value (which will be `false` if no value is specified).
  }
}

// Form.Field.Date

declare namespace Form.Field {
  class Date extends Form.Field {
    constructor(key: string, displayName?: string | null, value?: Date | null, formatter?: Formatter.Date | null);
    // Returns a new `Date` field, optionally with an initial value, and optionally a date formatter. If no formatter is specified, a default one will be created that follows the user's date formatting preferences to display and determine component ordering when parsing dates. Relative dates like "1d", "tomorrow", "now" can also be entered.
  }
}

// Form.Field.MultipleOptions

declare namespace Form.Field {
  class MultipleOptions extends Form.Field {
    constructor(
      key: string,
      displayName: string | null,
      options: Array<Object>,
      names: Array<string> | null,
      selected: Array<Object>,
    );
    // Returns a new `MultipleOptions` field, allowing the user to pick multiple items from a list of option objects. A list of names may also be given, which must have the same length as the options array if so. If no names are given, the objects are converted to strings for display. An array of zero or more initially selected objects (which must be members of the options array) may also be given. An empty array is valid input for the initially selected items. Additionally, it is valid for `MultipleOptions` fields to have a value that is an empty array.
  }
}

// Form.Field.Option

declare namespace Form.Field {
  class Option extends Form.Field {
    constructor(
      key: string,
      displayName: string | null,
      options: Array<Object>,
      names?: Array<string> | null,
      selected?: Object | null,
      nullOptionTitle?: string | null,
    );
    // Returns a new `Option` field, allowing the user to pick from a list of option objects. A list of names may also be given, which must have the same length as the options array if so. If no names are given, the objects are converted to strings for display. An initially selected object (which must be a member of the options array) may also be given. If the field is not configured to allow a `null` value and no initially `selected` value is specified, the user must select a value before the field is considered valid under the default form validation.
    allowsNull: boolean;
    // If set to `true`, an option will be added to allow selecting `null`.
    nullOptionTitle: string | null;
    // If `null` is allowed, this will be used for the title of that option. Otherwise a default title will be used.
  }
}

// Form.Field.Password

declare namespace Form.Field {
  class Password extends Form.Field {
    // A field for text-based input, optionally using a `Formatter` to convert the string value into a different type.
    constructor(key: string, displayName?: string | null, value?: string | null);
    // Returns a new `Password` field, optionally with an initial value. The displayed text will be obscured.
  }
}

// Form.Field.String

declare namespace Form.Field {
  class String extends Form.Field {
    // A field for text-based input, optionally using a `Formatter` to convert the string value into a different type.
    constructor(key: string, displayName?: string | null, value?: Object | null, formatter?: Formatter | null);
    // Returns a new `String` field, optionally with an initial value and formatter. If a formatter is specified, the value should be of the output type from the formatter or null. If no formatter is specified, the value should be a string or null.
  }
}

// Formatter

declare class Formatter {}

// Formatter.Date

declare namespace Formatter.Date {
  function withStyle(dateStyle: Formatter.Date.Style, timeStyle?: Formatter.Date.Style | null): Formatter.Date;
  // A formatter that will display dates according to the specified date and time formats selected in system settings.
  function withFormat(format: string): Formatter.Date;
  // Returns a formatter with a specific ICU date format and the user's current locale, calendar, and timeZone. See <http://userguide.icu-project.org/formatparse/datetime/> for details on date format strings.
  const iso8601: Formatter.Date;
  // Return a date formatter that produces ISO-8601 formatted dates, using the Gregorian calendar and the UTC time zone.
}

declare namespace Formatter {
  class Date extends Formatter {
    stringFromDate(date: Date): string;
    dateFromString(string: string): Date | null;
    calendar: Calendar;
    readonly dateFormat: string;
    locale: Locale;
    timeZone: TimeZone;
  }
}

// Formatter.Decimal

declare namespace Formatter.Decimal {
  function currency(code?: string | null): Formatter.Decimal;
  // Returns a new formatter that will display the value as a currency value. An ISO currency code may be specified to pick a specific currency, or null may be passed to use the default currency for the user's locale. If the argument is not a valid currency code, an error will be thrown.
  const currencyCodes: Array<string>;
  // Deprecated: Please use the `currencyCode` property on `Locale` instead.
  // Returns the list of known ISO currency codes
  const custom: Formatter.Decimal;
  // Returns a new formatter that can be configured with custom settings.
  const decimal: Formatter.Decimal;
  // Returns a new number formatter that will use both a decimal separator.
  const percent: Formatter.Decimal;
  // Returns a new number formatter that will display the value as a percentage.
  const percentWithDecimal: Formatter.Decimal;
  // Returns a new number formatter that will display the value as a percentage with a decimal separator.
  const plain: Formatter.Decimal;
  // Returns a new number formatter that will not use any separators.
  const thousandsAndDecimal: Formatter.Decimal;
  // Returns a new number formatter that will use both a thousands and decimal separator.
}

declare namespace Formatter {
  class Decimal extends Formatter {
    // This formatter class formats and parses `Decimal`-valued strings (note, _not_ `Number` values).
    stringFromDecimal(number: Decimal): string | null;
    // Format a `Decimal` as a string, based on the rules set on the formatter.
    decimalFromString(string: string): Decimal | null;
    // Parses a `Decimal` from a string, based on the rules set on the formatter. Returns `null` if the value was not recognized.
    decimalSeparator: string;
    // The string to display between the whole portion of a number and the decimal portion.
    negativeFormat: string;
    // A format string to use for negative values.
    positiveFormat: string;
    // A format string to use for positive values.
    thousandsSeparator: string | null;
    // The string to display between groups of digits representing powers of a thousand.
    zeroSymbol: string | null;
    // The string to use when displaying a zero value. If this is `null`, the `positiveFormat` is used.
  }
}

// Formatter.Duration

declare namespace Formatter {
  class Duration extends Formatter {
    constructor();
    stringFromDecimal(number: Decimal): string | null;
    decimalFromString(string: string): Decimal | null;
    hoursPerDay: number;
    hoursPerWeek: number;
    useVerboseFormat: boolean;
  }
}

// Formatter.Date.Style

declare namespace Formatter.Date.Style {
  const Full: Formatter.Date.Style;
  // Use the user's "full" format as selected in system settings.
  const Long: Formatter.Date.Style;
  // Use the user's "long" format as selected in system settings.
  const Medium: Formatter.Date.Style;
  // Use the user's "medium" format as selected in system settings.
  const Short: Formatter.Date.Style;
  // Use the user's "short" format as selected in system settings.
  const all: Array<Formatter.Date.Style>;
}

declare namespace Formatter.Date {
  class Style {}
}

// Image

declare namespace Image {
  function symbolNamed(name: string): Image | null;
  // Returns an image given a symbol name.
}

declare class Image {}

// LanguageModel

declare class LanguageModel {}

// LanguageModel.GenerationOptions

declare namespace LanguageModel {
  class GenerationOptions {
    constructor();
    maximumResponseTokens: number | null;
    // See Apple's documentation for `maximumResponseTokens`.
  }
}

// LanguageModel.Schema

declare namespace LanguageModel.Schema {
  function fromJSON(json: Object): LanguageModel.Schema;
  // Returns a `LanguageModel.Schema` based on the provided JSON schema. Schemas can be named and recursively referenced.
}

declare namespace LanguageModel {
  class Schema {
    // When working with a `LanguageModel`, you typically provide text input and get text back as a response. The `LanguageModel.Schema` class guides the structure of the response, so you can results which are in a format that you expect.
    // For example, if you'd like the language model to return an array of steps, each of which has a title, a description, and a priority, you might write:
    // ```
    // (async () => {
    //    const schema = LanguageModel.Schema.fromJSON({
    //        arrayOf: {
    //            name: "step-schema",
    //            properties: [
    //                {name: "title"},
    //                {name: "description", isOptional: true},
    //                {name: "priority", schema: {
    //                    name: "priority-schema", anyOf: [{constant: "high"}, {constant: "low"}]
    //                }},
    //                {name: "childSteps", description: "A breakdown of steps.", isOptional: true, schema: {arrayOf: {referenceTo: "step-schema"}, minimumElements: 1}}
    //            ]
    //        }
    //    });
    //    const prompt = 'Provide a list of steps required to add solar power to your home.';
    //    console.log(prompt);
    //    const session = new LanguageModel.Session();
    //    let options = new LanguageModel.GenerationOptions()
    //    options.maximumResponseTokens = 4096;
    //    const responseJSON = await session.respondWithSchema(prompt, schema);
    //    console.log(responseJSON);
    //    const response = JSON.parse(responseJSON);
    //    console.log(response.map(item => item.title + ":" + item.priority));
    // })()
    // ```
    // Here's some sample output from the final statement in the above script:
    // ```
    // Research and Planning:high,Choose a Location:high,Get Permits and Approvals:high,Select Solar Panels and Inverter:high,Hire a Professional Installer:high,Install Solar Panels:high,Connect to the Electrical System:high,Monitor and Maintain:low
    // ```
    // This example demonstrates several different schema nodes:
    // - `arrayOf` --- The top-level schema indicates that it's expecting an array of objects conforming to a specified child schema ("step"). You can also specify `minimumElements` and `maximumElements` for the array.
    // - `properties` --- The "steps-schema" child schema indicates that each step has multiple properties: a "title", a "description", and a "priority". Each of these properties has a required `name` which is how you'll look up that property in the result. You can also optionally specify a `description` (so the language model has more information about the property), whether the property is optional, and a child `schema` (if you want the property's value to be something other than a simple string), and you can indicate whether the property `isOptional`.
    // - `anyOf` --- The `priority-schema` (used for the `priority` property) offers a choice between high and low priorities.
    // - `constant` --- The high and low priorities are defined as simple constants containing the constant string "high" and the constant string "low".
    // - `referenceTo` --- The `childSteps` property demonstrates a recursive schema, where each step can contain additional steps that are defined the same way.
    // The resulting JSON is parsed back into an object graph using `JSON.parse()`, at which point you can walk the object graph and its expected properties (as demonstrated by the final `console.log()` statement).
  }
}

// LanguageModel.Session

declare namespace LanguageModel.Session {
  function withTools(tools: Array<LanguageModel.Tool>, instructions?: string | null): LanguageModel.Session;
  // Creates a new instance, providing tools. See `LanguageModel.Tool` for details.
}

declare namespace LanguageModel {
  class Session {
    constructor(instructions?: string | null);
    // Creates a new instance.
    respond(prompt: string): Promise<string>;
    // Produces a text response to a prompt.
    respondWithSchema(
      prompt: string,
      schema: LanguageModel.Schema,
      generationOptions?: LanguageModel.GenerationOptions | null,
    ): Promise<string>;
    // Produces a JSON response to a prompt using the provided schema.
  }
}

// LanguageModel.Tool

declare namespace LanguageModel {
  class Tool {
    // When working with a `LanguageModel`, you can provide tools that it can use to obtain information or make calculations that haven't been provided through its training data or the current session's prompt history. For example, if you'd like to provide a tool to assist the model with dates, you might write something like this:
    // ```
    // const dateFormatter = Formatter.Date.withStyle(Formatter.Date.Style.Medium)
    // const dateTool = new LanguageModel.Tool("getDate", "Parses the specified date and time and returns a date. Can specify \"today\" for today's date.", null, async (input) => {
    //     console.log("DEBUG: dateTool:", JSON.stringify(input));
    //     const inputText = input.text;
    //     const result = dateFormatter.dateFromString(inputText || "now");
    //     console.log("DEBUG: dateTool: ->", JSON.stringify(result));
    //     return result;
    // });
    // ```
    // The definition of a tool has several parameters:
    // - `name` --- Each tool must be given a unique name, that is used by the language model both to understand what the tool does and to invoke the tool when it wants to use it.
    // - `description` --- The tool's description helps the language model understand when and how to use the tool.
    // - `schema` --- The provided schema specifies how the tool would like its input to be formatted. If no input schema is provided, the tool will use a simple default schema with a `text` property.
    // - `function` --- The provided function takes `input` (based on the provided description and schema) and calculates a result to return back to the language model. The result will be encoded as JSON and returned to the model for use in its calculations. Note that the function can be asynchronous but doesn't have to be. (The `dateTool` example above would work with or without the `async` keyword, since there aren't any `await` calls within the function.)
    constructor(name: string, description: string, inputSchema: LanguageModel.Schema | null, f: Function);
    // Creates a new instance.
  }
}

// LigatureStyle

declare namespace LigatureStyle {
  const All: LigatureStyle; // Use all of the available ligatures.
  const Essential: LigatureStyle;
  // Use ligatures that are required for proper rendering of text.
  const Standard: LigatureStyle;
  // Use the default ligatures for the given script.
  const all: Array<LigatureStyle>;
}

declare class LigatureStyle {}

// Locale

declare namespace Locale {
  const identifiers: Array<string>;
  // The list of known ISO locale identifiers.
}

declare class Locale {
  constructor(identifier: string);
  readonly calendar: Calendar; // The calendar for the locale.
  readonly currencyCode: string | null; // The currency code for the locale.
  readonly identifier: string;
  // The ISO locale identifier for this object.
}

// MenuItem

declare class MenuItem {
  checked: boolean;
  // If true, a checkmark is displayed next to the `MenuItem`'s label.
  image: Image | null;
  // An optional image to be displayed with the `MenuItem`.
  label: string;
  // The string displayed to describe the `MenuItem`'s action.
}

// NamedStyle.List

declare namespace NamedStyle {
  class List {
    add(name?: string | null): NamedStyle;
    // Makes a new `NamedStyle` at the end of the `NamedStyleList`, and optionally assigns it a name.
    byName(name: string): NamedStyle | null;
    // Returns the first named style that has the specified `name`, or `null` if none do.
    byIdentifier(identifier: string): NamedStyle | null;
    // Returns the single named style with the specified `identifier`, or `null` if no style has that `identifier`.
    moveStyles(styles: Array<NamedStyle>, position: NamedStylePosition): void;
    // Reorders the named styles within the `NamedStyleList`. This cannot be used to move styles between documents.
    duplicateStyles(styles: Array<NamedStyle>, position: NamedStylePosition): Array<NamedStyle>;
    readonly all: Array<NamedStyle>;
    // Returns the list of all `NamedStyles`. Note that the order determine which attribute values are applied if two named styles have conflicting settings.
    readonly beginning: NamedStylePosition;
    // Returns a `NamedStylePosition` that indicates the position before any existing named styles.
    readonly end: NamedStylePosition;
    // Returns a `NamedStylePosition` that indicates the position before after existing named styles.
  }
}

// NamedStylePosition

declare class NamedStylePosition {}

// Notification

declare class Notification {
  constructor(title: string);
  show(): Promise<Notification>;
  // Attempts to present the notification and returns a `Promise` which will yield the notification object itself if it is clicked or tapped, or an error if it cannot be presented or is dismissed.
  subtitle: string | null;
  title: string;
}

// ObjectIdentifier

declare class ObjectIdentifier {
  // A unique identifier referring to a `DatabaseObject`.

  readonly objectClass: Object | null;
  // Returns the constructor object that would be used for instances of the class for this `ObjectIdentifier`.
  readonly primaryKey: string;
  // Returns the primary key of the object identifier.
}

// Pasteboard

declare namespace Pasteboard {
  function makeUnique(): Pasteboard;
  // Creates a new unique pasteboard.
  const general: Pasteboard;
  // The `Pasteboard` used for user-initiated copy/paste support.
}

declare class Pasteboard {
  // A pasteboard temporarily holds representations of items of different types for transfer between different applications or different locations in the application.

  availableType(types: Array<TypeIdentifier>): TypeIdentifier | null;
  // The first type from the provided list which is available on the pasteboard, or `null` if none are available.
  addItems(items: Array<Pasteboard.Item>): void;
  // Appends the new items to the pasteboard.
  clear(): void;
  // Remove all items from the pasteboard.
  dataForType(type: TypeIdentifier): Data | null;
  // The `Data` representation for the given type in this pasteboard, or `null` if none is available.
  setDataForType(data: Data, type: TypeIdentifier): void;
  // Set the `Data` representation for the given type in this pasteboard, replacing any previously set data.
  stringForType(type: TypeIdentifier): string | null;
  // The `String` representation for the given type in this pasteboard, or `null` if none is available.
  setStringForType(string: string, type: TypeIdentifier): void;
  // Set the `String` representation for the given type in this pasteboard, replacing any previously set data.
  URL: URL | null;
  // Gets or sets the pasteboard content as a single URL.
  URLs: Array<URL> | null;
  // Gets or sets the pasteboard content as a list of URLs.
  color: Color | null;
  // Gets or sets the pasteboard content as a single color.
  colors: Array<Color> | null;
  // Gets or sets the pasteboard content as a list of colors.
  readonly hasColors: boolean;
  // Returns `true` if the pasteboard contains one or more colors.
  readonly hasImages: boolean;
  // Returns `true` if the pasteboard contains one or more images.
  readonly hasStrings: boolean;
  // Returns `true` if the pasteboard contains one or more strings.
  readonly hasURLs: boolean;
  // Returns `true` if the pasteboard contains one or more URLs.
  image: Image | null;
  // Gets or sets the pasteboard content as a single image.
  images: Array<Image> | null;
  // Gets or sets the pasteboard content as a list of images.
  items: Array<Pasteboard.Item>;
  // The array of individual items on the pasteboard, each potentially with their own set of types.
  string: string | null;
  // Gets or sets the pasteboard content as a single plain-text string.
  strings: Array<string> | null;
  // Gets or sets the pasteboard content as a list of plain-text strings.
  readonly types: Array<TypeIdentifier>;
  // The list of pasteboard types currently available on the pasteboard.
}

// Pasteboard.Item

declare namespace Pasteboard {
  class Item {
    constructor();
    // Make a new empty pasteboard item with no contents.
    dataForType(type: TypeIdentifier): Data | null;
    // The `Data` representation for the given type in this pasteboard item, or `null` if none is available.
    setDataForType(data: Data, type: TypeIdentifier): void;
    // Set the `Data` representation for the given type in this pasteboard item, replacing any previously set data.
    stringForType(type: TypeIdentifier): string | null;
    // The `String` representation for the given type in this pasteboard item, or `null` if none is available.
    setStringForType(string: string, type: TypeIdentifier): void;
    // Set the `String` representation for the given type in this pasteboard item, replacing any previously set data.
    readonly types: Array<TypeIdentifier>;
    // The list of types available for this pasteboard item.
  }
}

// Perspective

declare namespace Perspective {
  const all: Array<Perspective.BuiltIn | Perspective.Custom>;
  // Returns all the built-in and custom perspectives, in their user-preferred order.
  const favorites: Array<Perspective.BuiltIn | Perspective.Custom>; // Returns the favorite perspectives.
}

declare class Perspective {}

// Perspective.BuiltIn

declare namespace Perspective.BuiltIn {
  const Flagged: Perspective.BuiltIn; // The flagged items.
  const Forecast: Perspective.BuiltIn; // The upcoming due items.
  const Inbox: Perspective.BuiltIn; // The inbox of tasks.
  const Nearby: Perspective.BuiltIn; // Nearby items on a map (iOS only).
  const Projects: Perspective.BuiltIn; // The library of projects.
  const Review: Perspective.BuiltIn; // The projects needing review.
  const Search: Perspective.BuiltIn;
  // A search of the database. This perspective cannot be set, but might be reported if the user is searching.
  const Tags: Perspective.BuiltIn; // The hierarchy of tags.
  const all: Array<Perspective.BuiltIn>;
}

declare namespace Perspective {
  class BuiltIn {
    readonly name: string; // The name of the built in perspective.
  }
}

// PlugIn

declare namespace PlugIn {
  function find(identifier: string, minimumVersion?: Version | null): PlugIn | null;
  const all: Array<PlugIn>;
}

declare class PlugIn {
  library(identifier: string): PlugIn.Library | null;
  // Looks for a `PlugIn.Library` in the receiver and returns it if found.
  action(identifier: string): PlugIn.Action | null;
  handler(identifier: string): PlugIn.Handler | null;
  resourceNamed(name: string): URL | null;
  imageNamed(name: string): Image | null;
  localizedResourceNamed(filename: string): FileWrapper | null;
  readonly URL: URL | null;
  // Returns the original URL from whence this `PlugIn` came, if known.
  readonly actions: Array<PlugIn.Action>;
  readonly author: string; // Returns the author for the `PlugIn`.
  readonly description: string;
  // Returns the description provided for the `PlugIn`.
  readonly displayName: string;
  // Returns the localized, human-readable name for the `PlugIn`.
  readonly handlers: Array<PlugIn.Handler>;
  readonly identifier: string;
  // The unique identifier of the `PlugIn`.
  readonly libraries: Array<PlugIn.Library>;
  readonly version: Version;
  // Returns the current `Version` for the `PlugIn`.
}

// PlugIn.Action

declare namespace PlugIn {
  class Action {
    constructor(perform: Function);
    // Returns a new `PlugIn.Action`. Only used within an action JavaScript file embedded within a PlugIn.
    readonly description: string;
    readonly image: Image;
    // Returns the image to use for interface controls that invoke the action, such as a menu or toolbar item. To use an SF Symbol, single-file plug-ins can set the "image" metadata parameter to the name of the desired symbol.
    readonly label: string;
    // Returns the default label to use for interface controls that invoke the action.
    readonly longLabel: string;
    // Returns the label to use for interface controls that invoke the action, when a long amount of space is available.
    readonly mediumLabel: string;
    // Returns the label to use for interface controls that invoke the action, when a medium amount of space is available.
    readonly name: string;
    // Returns the name of the `PlugIn.Action`.
    readonly paletteLabel: string;
    // Returns the label to use for interface controls that show a prototype of the action control, such as on a macOS toolbar configuration sheet.
    readonly perform: Function;
    readonly plugIn: PlugIn;
    // Returns the `PlugIn` that contains this object.
    readonly shortLabel: string;
    // Returns the label to use for interface controls that invoke the action, when a short amount of space is available.
    validate: Function | null;
    // A function to check whether the action is supported, given the current application state, as determined by the arguments passed (typically including the selection). This optional Function may be configured while the `Action` is being loaded, but after that the `Action` will be frozen.
  }
}

// PlugIn.Handler

declare namespace PlugIn {
  class Handler {
    constructor(invoke: Function);
    // Returns a new `PlugIn.Handler`. Only used within an handler JavaScript file embedded within a PlugIn.
    readonly invoke: Function;
    // The `Function` that will be executed for each handler registered for an event posted by an application object.
    readonly name: string;
    // Returns the name of the `PlugIn.Handler`.
    readonly plugIn: PlugIn;
    // Returns the `PlugIn` that contains this object.
    willAttach: Function | null;
    // An optional `Function` that can be set on `PlugIn.Handler` as it is being loaded (but not after). This function is passed the application object that post events to trigger the handler. The return value should be a state object that is JSON archivable (or `undefined` if the handler has no state to maintain across invocations).
    willDetach: Function | null;
    // An optional `Function` that can be set on `PlugIn.Handler` as it is being loaded (but not after). Called when a previously attached `PlugIn.Handler` is being detached from an application object. Any return value or thrown error are ignored.
  }
}

// PlugIn.Library

declare namespace PlugIn {
  class Library {
    // An object that represents a library from a plug-in.
    constructor(version: Version);
    // Returns a new `Library`. Typically only used within a library JavaScript file embedded within a PlugIn.
    readonly name: string;
    // Returns the name of the `PlugIn.Library`.
    readonly plugIn: PlugIn;
    // Returns the `PlugIn` that contains this object.
    readonly version: Version;
    // Returns the `Version` of this library, as passed to the constructor.
  }
}

// Preferences

declare class Preferences {
  constructor(identifier?: string | null);
  // Creates a new `Preferences` instance. The identifier specified may be `null` to create an instance for the currently loading plug-in. If it is `null` and a plug-in is not being loaded, an error will be thrown. Key/value pairs stored in the instance will be prefixed with the identifier and a ".".
  read(key: string): Object | null;
  // Returns the previously stored value for the given key, or `null` if no value is stored.
  readBoolean(key: string): boolean;
  // Returns the previously stored value as a `Boolean`, or `false` if there is no stored value or it can't be converted to a `Boolean`.
  readString(key: string): string | null;
  // Returns the previously stored value as a `String`, or `null` if there is no stored value or it is not a `String`.
  readNumber(key: string): number;
  // Returns the previously stored value as a `Number`, or `null` if there is no stored value or it is not a `Number`.
  readDate(key: string): Date | null;
  // Returns the previously stored value as a `Date`, or `null` if there is no stored value or it is not a `Date`.
  readData(key: string): Data | null;
  // Returns the previously stored value as a `Data`, or `null` if there is no stored value or it is not a `Data`.
  write(key: string, value?: boolean | string | number | Date | Data | null): void;
  // Stores the specified key/value pair, or removes the pair if `value` is `null`.
  remove(key: string): void;
  // Removes and previously stored value for the given key.
  readonly identifier: string;
  // The scoping identifier the instance given when created, or the plug-in identifier if none was given.
}

// Project.ReviewInterval

declare namespace Project {
  class ReviewInterval {
    // `Project.ReviewInterval` is a value object which represents a simple repetition interval. Because it's a value object rather than a proxy, changing its properties doesn't affect any projects directly. To change a project's review interval, update the value and assign it back to the project's `reviewInterval` property:
    // ```
    // let project = projectNamed("Miscellaneous");
    // let reviewInterval = project.reviewInterval;
    // reviewInterval.steps = 3;
    // reviewInterval.unit = "months";
    // project.reviewInterval = reviewInterval;
    // ```
    // Note: At one time these simple repetition intervals were also used for task repetitions, but over time we replaced those with the more flexible `Task.RepetitionRule`. Eventually we expect to also replace this review interval with flexible repetition rules.
    steps: number;
    // The count of `units` to use for this interval (e.g. "14" days or "12" months).
    unit: string;
    // The units to use (e.g. "days", "weeks", "months", "years").
  }
}

// Project.Status

declare namespace Project.Status {
  const Active: Project.Status; // The project is active.
  const Done: Project.Status;
  // The project has been marked as completed.
  const Dropped: Project.Status; // The project has been dropped.
  const OnHold: Project.Status; // The project has been put on-hold.
  const all: Array<Project.Status>;
}

declare namespace Project {
  class Status {}
}

// QuickOpenScriptAction

declare class QuickOpenScriptAction {
  image: Image | null;
  // An optional image to be displayed with the `MenuItem`.
  label: string;
  // The string displayed to describe the `MenuItem`'s action.
}

// Selection

declare class Selection {
  // An object representing the current selection in a `Window`.

  readonly allObjects: Array<Object>;
  // Returns all the objects in the selection.
  readonly database: Database | null;
  // Returns the `Database` object in the selection, if any.
  readonly databaseObjects: Array<DatabaseObject>;
  // Returns all the `DatabaseObject` objects in the selection, if any.
  readonly document: DatabaseDocument | null;
  // The `Document` containing the selection.
  readonly folders: FolderArray;
  // Returns all the `Folder` objects in the selection, if any.
  readonly projects: ProjectArray;
  // Returns all the `Project` objects in the selection, if any.
  readonly tags: TagArray;
  // Returns all the `Tag` objects in the selection, if any.
  readonly tasks: TaskArray;
  // Returns all the `Task` objects in the selection, if any.
  readonly window: DocumentWindow | null;
  // The `Window` containing the selection.
}

// Settings

declare class Settings {
  // `Settings` represent the database synchronized configuration values. *NOTE:* editing these should be done with care, as storing invalid values may corrupt your database or produce instability in the various client applications.

  defaultObjectForKey(key: string): Object | null;
  hasNonDefaultObjectForKey(key: string): boolean;
  objectForKey(key: string): Object | null;
  setObjectForKey(value: Object | null, key: string): void;
  boolForKey(key: string): boolean;
  setBoolForKey(value: boolean, key: string): void;
  integerForKey(key: string): number;
  setIntegerForKey(value: number, key: string): void;
  readonly keys: Array<string>;
}

// SharePanel

declare class SharePanel {
  // An interface that can display the system share interaction for the given items.

  constructor(items: Array<URL | string | Image | FileWrapper>);
  // Create a new share panel with the given items.
  addItem(shareItem: URL | string | Image | FileWrapper): void;
  // Appends the item to the end of `items`.
  addItems(shareItems: Array<URL | string | Image | FileWrapper>): void;
  // Appends the contents of the given array to the end of `items`.
  removeItem(shareItem: URL | string | Image | FileWrapper): void;
  // Removes the first occurrence of the item from `items` if it is present in `items`.
  removeItems(shareItems: Array<URL | string | Image | FileWrapper>): void;
  // Removes the first occurrence of each member of the given array from `items` if that member is present in `items`.
  clearItems(): void;
  // Sets `items` to an empty array. Note: Calling `show` when `items` is empty results in an error, so be sure to add new items after calling this and before calling `show`.
  show(): void;
  // Presents the share panel for its items. Calling this when `items` is empty will result in an error.
  items: Array<URL | string | Image | FileWrapper>;
  // The items that will be supplied to the system share interaction upon calling `show`.
}

// Speech

declare class Speech {}

// Speech.Boundary

declare namespace Speech.Boundary {
  const Immediate: Speech.Boundary;
  const Word: Speech.Boundary;
  const all: Array<Speech.Boundary>;
}

declare namespace Speech {
  class Boundary {}
}

// Speech.Synthesizer

declare namespace Speech {
  class Synthesizer {
    constructor();
    speakUtterance(utterance: Speech.Utterance): void;
    // Enqueues the utterance. If the utterance is already enqueued or speaking, throws an error.
    stopSpeaking(boundary: Speech.Boundary): boolean;
    pauseSpeaking(boundary: Speech.Boundary): boolean;
    continueSpeaking(): boolean;
    readonly paused: boolean;
    readonly speaking: boolean;
  }
}

// Speech.Utterance

declare namespace Speech.Utterance {
  const defaultSpeechRate: number;
  const maximumSpeechRate: number;
  const minimumSpeechRate: number;
}

declare namespace Speech {
  class Utterance {
    constructor(string: string);
    pitchMultiplier: number;
    // A value between 0.5 and 2.0, controlling the picth of the utterance.
    postUtteranceDelay: number;
    preUtteranceDelay: number;
    prefersAssistiveTechnologySettings: boolean;
    // If an assistive technology is on, like VoiceOver, the user's selected voice, rate and other settings will be used for this speech utterance instead of the default values. If no assistive technologies are on, then the values of the properties on AVSpeechUtterance will be used. Note that querying the properties will not refect the user's settings.
    rate: number;
    // A value between `Speech.Utterance.minimumSpeechRate` and `Speech.Utterance.maximumSpeechRate` controlling the rate of speech for the utterance.
    readonly string: string | null;
    voice: Speech.Voice | null;
    // The voice to use for this utterance, or `null` in which case the default voice will be used.
    volume: number;
    // A value between 0.0 and 1.0 controller the volume of the utterance.
  }
}

// Speech.Voice

declare namespace Speech.Voice {
  function withLanguage(code?: string | null): Speech.Voice | null;
  // Returns a voice for the given BCP-47 language code (such as `en-US` or `fr-CA`), or the default voice if passed `null`. Returns `null` for an invalid langauge code.
  function withIdentifier(identifier: string): Speech.Voice | null;
  // Returns the voice with the given identifier, or `null` if not found.
  const allVoices: Array<Speech.Voice>;
  const currentLanguageCode: string;
}

declare namespace Speech {
  class Voice {
    readonly gender: Speech.Voice.Gender;
    readonly identifier: string;
    readonly language: string;
    readonly name: string;
  }
}

// Speech.Voice.Gender

declare namespace Speech.Voice.Gender {
  const Female: Speech.Voice.Gender;
  const Male: Speech.Voice.Gender;
  const Unspecified: Speech.Voice.Gender;
  const all: Array<Speech.Voice.Gender>;
}

declare namespace Speech.Voice {
  class Gender {}
}

// StringEncoding

declare namespace StringEncoding {
  const ASCII: StringEncoding;
  const ISO2022JP: StringEncoding;
  const ISOLatin1: StringEncoding;
  const ISOLatin2: StringEncoding;
  const JapaneseEUC: StringEncoding;
  const MacOSRoman: StringEncoding;
  const NextStep: StringEncoding;
  const NonLossyASCII: StringEncoding;
  const ShiftJIS: StringEncoding;
  const Symbol: StringEncoding;
  const UTF16: StringEncoding;
  const UTF16BigEndian: StringEncoding;
  const UTF16LittleEndian: StringEncoding;
  const UTF32: StringEncoding;
  const UTF32BigEndian: StringEncoding;
  const UTF32LittleEndian: StringEncoding;
  const UTF8: StringEncoding;
  const Unicode: StringEncoding;
  const WindowsCP1250: StringEncoding;
  const WindowsCP1251: StringEncoding;
  const WindowsCP1252: StringEncoding;
  const WindowsCP1253: StringEncoding;
  const WindowsCP1254: StringEncoding;
  const all: Array<StringEncoding>;
}

declare class StringEncoding {}

// Style

declare class Style {
  set(attribute: Style.Attribute, value?: Object | null): boolean;
  // Sets (or clears) the value for the given style attribute.
  // Styles that cascade from this one will inherit this value, if they don't define their own value or have a closer ancestor style that does.
  // Returns true if a change was actually made, false otherwise. Throws an error if the key does not map to a known attribute, or if the value is of the wrong type for the specified attribute.
  get(attribute: Style.Attribute): Object | null;
  // Looks up the value for the specified style attribute locally, in the cascading and inherited styles, and finally falling back to the default value for the style attribute.
  localValueForAttribute(attribute: Style.Attribute): Object | null;
  // Looks up the value for the specified style attribute locally, returning null if it is not set.
  addNamedStyle(namedStyle: NamedStyle): void;
  // Adds the specified `NamedStyle` to the set of named styles to include in this `Style`. If the style is already present, or if this would create a loop (adding two `NamedStyles` to each other's list of named styles), an error will be thrown.
  removeNamedStyle(namedStyle: NamedStyle): void;
  // Removes the specified `NamedStyle` from the set of named styles to include in this `Style`. If the style is not present, an error will be thrown.
  influencedBy(otherStyle: Style): boolean;
  // Returns `true` if the receiver is influenced, directly or indirectly from the passed `Style`.
  setStyle(style: Style): void;
  // Updates all the attributes and inherited styles on the receiver to be the same as the argument `Style`.
  clear(): void;
  // Removes all the locally applied style attribute values for this `Style`.
  fontFillColor: Color;
  // The color used to fill text. Setting the color to `null` will remove the setting for this style.
  readonly link: URL | null;
  // Returns the `URL` link for a style, or `null` if there is no link applied. Note that `get(Style.Attribute.Link)` on the same style will return the default `URL` with an empty `toString()` value when there is no URL applied. If the style represents a file attachment and there is no specific link attribute set, the `URL` for the file attachment will be returned. If the style represents an file attachment that is embedded in the document, `null` will be returned.
  readonly locallyDefinedAttributes: Array<Style.Attribute>;
  // Returns an array of the `Style.Attribute`s defined on this `Style`.
  readonly namedStyles: Array<NamedStyle>;
  // Returns the `NamedStyle`s that are directly associated with this `Style`. If a style attribute lookup doesn't find a value in the local style, then the named styles will be searched.
}

// NamedStyle

declare class NamedStyle extends Style {
  remove(): void;
  // Removes the `NamedStyle` from the document. Any references to it are disconnected as well.
  readonly after: NamedStylePosition;
  // Returns a `NamedStylePosition` that indicates the slot after this item.
  readonly before: NamedStylePosition;
  // Returns a `NamedStylePosition` that indicates the slot before this item.
  readonly identifier: string;
  // A unique identifier for the style, which is suitable for long-lived references.
  name: string;
  // The name of the style that is presented in the interface.
}

// Style.Attribute

declare namespace Style.Attribute {
  const BackgroundColor: Style.Attribute;
  const BaselineOffset: Style.Attribute;
  const BaselineSuperscript: Style.Attribute;
  const Expansion: Style.Attribute;
  const FontCondensed: Style.Attribute;
  const FontFamily: Style.Attribute;
  const FontFillColor: Style.Attribute;
  const FontFixedPitch: Style.Attribute;
  const FontItalic: Style.Attribute;
  const FontName: Style.Attribute;
  const FontNarrow: Style.Attribute;
  const FontSize: Style.Attribute;
  const FontStrokeColor: Style.Attribute;
  const FontStrokeWidth: Style.Attribute;
  const FontWeight: Style.Attribute;
  const KerningAdjustment: Style.Attribute;
  const LigatureSelection: Style.Attribute;
  const Link: Style.Attribute;
  const Obliqueness: Style.Attribute;
  const ParagraphAlignment: Style.Attribute;
  const ParagraphBaseWritingDirection: Style.Attribute;
  const ParagraphDefaultTabInterval: Style.Attribute;
  const ParagraphFirstLineHeadIndent: Style.Attribute;
  const ParagraphHeadIndent: Style.Attribute;
  const ParagraphLineHeightMultiple: Style.Attribute;
  const ParagraphLineSpacing: Style.Attribute;
  const ParagraphMaximumLineHeight: Style.Attribute;
  const ParagraphMinimumLineHeight: Style.Attribute;
  const ParagraphSpacing: Style.Attribute;
  const ParagraphSpacingBefore: Style.Attribute;
  const ParagraphTabStops: Style.Attribute;
  const ParagraphTailIndent: Style.Attribute;
  const ShadowBlurRadius: Style.Attribute;
  const ShadowColor: Style.Attribute;
  const ShadowOffset: Style.Attribute;
  const StrikethroughAffinity: Style.Attribute;
  const StrikethroughColor: Style.Attribute;
  const StrikethroughPattern: Style.Attribute;
  const StrikethroughStyle: Style.Attribute;
  const UnderlineAffinity: Style.Attribute;
  const UnderlineColor: Style.Attribute;
  const UnderlinePattern: Style.Attribute;
  const UnderlineStyle: Style.Attribute;
}

declare namespace Style {
  class Attribute {
    readonly defaultValue: Object;
    // Returns the default value that will be used when a style has no local value for this attribute, nor do any of its associated styles.
    readonly key: string;
    // Returns the string used to identify this attribute when calling `get` or `set` on a `Style` instance.
  }
}

// Tag.ChildInsertionLocation

declare namespace Tag {
  class ChildInsertionLocation {
    // A location specified relative to an existing `Tag` or `Database`. These cannot be instantiated directly, rather they are returned from properties like `Tag.before` or `Database.beginning`.
  }
}

// Tag.Status

declare namespace Tag.Status {
  const Active: Tag.Status; // The tag is active.
  const Dropped: Tag.Status; // The tag has been dropped.
  const OnHold: Tag.Status; // The tag has been put on-hold.
  const all: Array<Tag.Status>;
}

declare namespace Tag {
  class Status {}
}

// Tag.TaskInsertionLocation

declare namespace Tag {
  class TaskInsertionLocation {
    // A location specifying the order of a `Task` within a `Tag`. These cannot be instantiated directly, rather they are returned from properties like `Tag.beforeTask()` or `Tag.endingOfTasks`. (For a complete list of locations, open the navigation sidebar and use its filter to search for `Tag.TaskInsertionLocation`.)
  }
}

// Task.AnchorDateKey

declare namespace Task.AnchorDateKey {
  const DeferDate: Task.AnchorDateKey;
  const DueDate: Task.AnchorDateKey;
  const PlannedDate: Task.AnchorDateKey;
  const all: Array<Task.AnchorDateKey>;
}

declare namespace Task {
  class AnchorDateKey {}
}

// Task.ChildInsertionLocation

declare namespace Task {
  class ChildInsertionLocation {
    // A location specified relative to an existing `Task` or `Database`. These cannot be instantiated directly, rather they are returned from properties like `Task.before`, `Inbox.ending`, or `Project.beginning`. (For a complete list of locations, open the navigation sidebar and use its filter to search for `Task.ChildInsertionLocation`.)
  }
}

// Task.Notification.Kind

declare namespace Task.Notification.Kind {
  const Absolute: Task.Notification.Kind;
  // This notification fires on a given date, regardless of its task's due and defer dates.
  const DueRelative: Task.Notification.Kind;
  // This notification fires at a time relative to its task's due date.
  const Unknown: Task.Notification.Kind;
  // It is not known what this notification's fire date is relative to.
  const all: Array<Task.Notification.Kind>;
}

declare namespace Task.Notification {
  class Kind {}
}

// Task.RepetitionMethod

declare namespace Task.RepetitionMethod {
  const DeferUntilDate: Task.RepetitionMethod;
  const DueDate: Task.RepetitionMethod;
  const Fixed: Task.RepetitionMethod;
  const None: Task.RepetitionMethod; // The task does not repeat.
  const all: Array<Task.RepetitionMethod>;
}

declare namespace Task {
  class RepetitionMethod {}
}

// Task.RepetitionRule

declare namespace Task {
  class RepetitionRule {
    // A `Task.RepetitionRule` describes a pattern of dates using a ICS formatted recurrence string and a `Task.RepetitionMethod` to describe how those dates are applied to a `Task`.
    constructor(
      ruleString?: string | null,
      method?: Task.RepetitionMethod | null,
      scheduleType?: Task.RepetitionScheduleType | null,
      anchorDateKey?: Task.AnchorDateKey | null,
      catchUpAutomatically?: boolean | null,
    );
    // Returns a new `Task.RepetitionRule` with the specified ICS rule string and scheduling information. If the rule string is not valid, an error will be thrown.
    // The system defaults will be used for `ruleString`, `scheduleType`, `anchorDateKey`, and `catchUpAutomatically` if not provided.
    // `method` is deprecated, but remains for backwards compatibility with existing scripts and `scheduleType` should be used instead.
    // If deprecated `method` is provided along with updated `scheduleType` and `anchorDateKey`, an error will be thrown.
    firstDateAfterDate(date: Date): Date | null;
    // Returns the first date described by the repetition rule that is after the given date unless the repetition is invalid (for example due to an elapsed UNTIL rule part).
    readonly anchorDateKey: Task.AnchorDateKey;
    // The date property to use when updating a repeating item for its next occurrence.
    readonly catchUpAutomatically: boolean;
    // Whether, when resolved, this item automatically skips any occurrences in the past (applies only to regularly repeating items).
    readonly method: Task.RepetitionMethod;
    // Deprecated: Use `scheduleType` instead.
    readonly ruleString: string;
    // The ICS rule string used to create the repetition rule.
    readonly scheduleType: Task.RepetitionScheduleType;
    // Explains how the ruleString will be applied when creating subsequent occurrences for a `Task` that repeats.
    // Used to represent when items repeat regularly from their assigned dates, calculate their next occurrence when resolved (i.e. completed or dropped), or have no repeat.
  }
}

// Task.RepetitionScheduleType

declare namespace Task.RepetitionScheduleType {
  const FromCompletion: Task.RepetitionScheduleType;
  const None: Task.RepetitionScheduleType; // The task does not repeat.
  const Regularly: Task.RepetitionScheduleType;
  const all: Array<Task.RepetitionScheduleType>;
}

declare namespace Task {
  class RepetitionScheduleType {}
}

// Task.Status

declare namespace Task.Status {
  const Available: Task.Status; // The task is available to work on.
  const Blocked: Task.Status;
  // The task is not available to work on currently, due to a future defer date, a preceeding task in a sequential project, or having an on-hold tag associated.
  const Completed: Task.Status; // The task is already completed.
  const Dropped: Task.Status; // The task will not be worked on.
  const DueSoon: Task.Status; // The task is incomplete and due soon.
  const Next: Task.Status;
  // The task is the first available task in a project.
  const Overdue: Task.Status; // The task is incomplete overdue.
  const all: Array<Task.Status>;
}

declare namespace Task {
  class Status {}
}

// Task.TagInsertionLocation

declare namespace Task {
  class TagInsertionLocation {
    // A location specifying the order of a `Tag` within a `Task`. These cannot be instantiated directly, rather they are returned from properties like `Task.beforeTag()` or `Task.endingOfTags`. (For a complete list of locations, open the navigation sidebar and use its filter to search for `Task.TagInsertionLocation`.)
  }
}

// Text

declare namespace Text {
  function makeFileAttachment(fileWrapper: FileWrapper, style: Style): Text;
  // Returns a new `Text` instance that represents a file attachment. The attachment has a single character string content with a special value.
}

declare class Text {
  constructor(string: string, style: Style);
  // Returns a new `Text` instance with the given string contents and `Style` applied to the entire range of text.
  textInRange(range: Text.Range): Text;
  // Returns a copy of the text in the specified range.
  styleForRange(range: Text.Range): Style;
  // Returns a `Style` instance for the given range of the `Text`.
  ranges(component: TextComponent, useEnclosingRange?: boolean | null): Array<Text.Range>;
  // Returns an array of `TextRange`s for the specified component. If `useEnclosingRange` is `true`, than any extra characters that separate follow a component will be included in its range. Any extra characters before the first found component will be included in the first range.
  replace(range: Text.Range, with_: Text): void;
  // Replaces the sub-range of the receiving `Text` with a copy of the passed in `Text` (which remains unchanged).
  append(text: Text): void;
  // Appends the given `Text` to the receiver.
  insert(position: Text.Position, text: Text): void;
  // Inserts a copy of the given `Text` at the specified position in the receiver.
  remove(range: Text.Range): void;
  // Removes the indicated sub-range of the receiving `Text`.
  find(string: string, options?: Array<Text.FindOption> | null, range?: Text.Range | null): Text.Range | null;
  // Finds an occurrence of `string` within the `Text` and returns the enclosing `Text.Range` if there is a match. If `range` is passed, only that portion of the `Text` is searched. The supplied `options`, if any, change how the search is performed based on their definition.
  readonly attachments: Array<Text>;
  // Returns an array of copies of the blocks of `Text` in the receiver that represent `Attachment`s. Note that editing these instances will not change the original.
  readonly attributeRuns: Array<Text>;
  // Returns an array of copies of the contiguous blocks of `Text` in the receiver that have the same style. Note that editing these instances will not change the original.
  readonly characters: Array<Text>;
  // Returns an array of copies of the characters in the `Text`. Note that editing these instances will not change the original.
  readonly end: Text.Position;
  // Returns a `Text.Position` indicating the end of the `Text`.
  readonly fileWrapper: FileWrapper | null;
  // Returns the attached file wrapper for the `Text` (or rather, the first character of the text), if any.
  readonly paragraphs: Array<Text>;
  // Returns an array of copies of the paragraphs in the `Text`. Note that editing these instances will not change the original. Paragraphs, if ended by a newline, will contain the newline character.
  readonly range: Text.Range;
  // Returns a `Text.Range` that spans the entire `Text`.
  readonly sentences: Array<Text>;
  // Returns an array of copies of the sentences in the `Text`. Note that editing these instances will not change the original.
  readonly start: Text.Position;
  // Returns a `Text.Position` indicating the beginning of the `Text`.
  string: string;
  // Returns a plain `String` version of the characters in the `Text`. Note that since JavaScript represents Strings as Unicode code points, the length of the returned string may be different from the number of `characters` in the `Text` object.
  // Assigning to this property replaces the string content of the `Text` with the given string. The style applied to the updated characters is either the base style of the `Text` if it is currently empty, or the style of the first replaced character otherwise.
  readonly style: Style;
  // Returns a `Style` instance for this `Text` object.
  readonly words: Array<Text>;
  // Returns an array of copies of the words in the `Text`. Note that editing these instances will not change the original.
}

// Text.FindOption

declare namespace Text.FindOption {
  const Anchored: Text.FindOption;
  // Matches must be anchored to the beginning (or end if Backwards is include) of the string or search range.
  const Backwards: Text.FindOption;
  // Search starting from the end of the string or range.
  const CaseInsensitive: Text.FindOption;
  // Compare upper and lower case characters as equal.
  const DiacriticInsensitive: Text.FindOption;
  // Ignore diacritics. For example, "ö" is considered the same as "o".
  const ForcedOrdering: Text.FindOption;
  // Force an ordering between strings that aren't strictly equal.
  const Literal: Text.FindOption;
  // Perform exact character-by-character matching.
  const Numeric: Text.FindOption;
  // Order numbers by numeric value, not lexigraphically. Only applies to ordered comparisons, not find operations.
  const RegularExpression: Text.FindOption;
  // For find operations, the string is treated as an ICU-compatible regular expression. If set, no other options can be used except for `CaseInsensitive` and `Anchored`.
  const WidthInsensitive: Text.FindOption;
  // Ignore width differences. For example, "a" is considered the same as 'FULLWIDTH LATIN SMALL LETTER A' (U+FF41).
  const all: Array<Text.FindOption>;
}

declare namespace Text {
  class FindOption {}
}

// Text.Position

declare namespace Text {
  class Position {}
}

// Text.Range

declare namespace Text {
  class Range {
    constructor(start: Text.Position, end: Text.Position);
    readonly end: Text.Position;
    // Returns the `Text.Position` for the end of the `Text.Range`
    readonly isEmpty: boolean;
    // Returns `true` if the `Text.Range` contains no characters.
    readonly start: Text.Position;
    // Returns the `Text.Position` for the beginning of the `Text.Range`
  }
}

// TextAlignment

declare namespace TextAlignment {
  const Center: TextAlignment; // Visually center aligned.
  const Justified: TextAlignment; // Fully-justified.
  const Left: TextAlignment; // Visually left aligned.
  const Natural: TextAlignment;
  // Use the default alignment based on the characters in the text.
  const Right: TextAlignment; // Visually right aligned.
  const all: Array<TextAlignment>;
}

declare class TextAlignment {}

// TextComponent

declare namespace TextComponent {
  const Attachments: TextComponent;
  // The ranges of Text which represent Attachments.
  const AttributeRuns: TextComponent;
  // The ranges of Text which have the same attributes.
  const Characters: TextComponent;
  // The individual characters of the Text. Note that some characters (like emoji) consist of multiple Unicode code points.
  const Paragraphs: TextComponent;
  // The paragraphs of Text. Unlike other options, the line breaking characters that end the paragraph are included.
  const Sentences: TextComponent; // The sentences of the Text.
  const Words: TextComponent;
  // The words in the Text. Whitespace or other word break characters are not included.
  const all: Array<TextComponent>;
}

declare class TextComponent {}

// TimeZone

declare namespace TimeZone {
  const abbreviations: Array<string>;
  // The list of known time zone abbreviations.
}

declare class TimeZone {
  constructor(abbreviation: string);
  // Make a new `TimeZone` with the given abbreviation. Note that the returned `TimeZone` may have a different abbreviation than the passed argument. For example, if one of "PST" or "PDT" is requested that doens't match the current use of daylight savings time, the one that does match will be returned.
  readonly abbreviation: string | null; // The abbreviation for the `TimeZone`.
  readonly daylightSavingTime: boolean;
  // Returns `true` if the `TimeZone` is currently using daylight savings time.
  readonly secondsFromGMT: number;
  // The current difference in seconds between this `TimeZone` and GMT.
}

// Timer

declare namespace Timer {
  function once(interval: number, action: (timer: Timer) => void): Timer;
  // Makes a new `Timer` that will fire once, after the specified interval (in seconds from the current time). When the `Timer` fires, the passed in `Function` is called, passing the `Timer` as its argument.
  function repeating(interval: number, action: (timer: Timer) => void): Timer;
  // Makes a new `Timer` that will fire repeatedly with the specified interval (in seconds, with the first invocation happening that interval after the current time). When the `Timer` fires, the passed in `Function` is called, passing the `Timer` as its argument.
}

declare class Timer {
  cancel(): void;
  readonly interval: number;
}

// ToolbarItem

declare class ToolbarItem {
  image: Image | null;
  label: string;
  toolTip: string | null;
}

// Tree

declare class Tree {
  nodeForObject(object: Object): TreeNode | null;
  // Returns the `TreeNode` that represents the `object` in this `Tree`, or `null` if it cannot be found (possibly filtered out).
  nodesForObjects(object: Array<Object>): Array<TreeNode>;
  // Returns an array of `TreeNode`s for the objects that are currently in the `Tree`, according to the same filters as `nodeForObject()`. The size of the resulting node array may be smaller (even empty) than the passed in `objects` array.
  reveal(nodes: Array<TreeNode>): void;
  // Ensures the ancestor nodes of all the specified nodes are expanded.
  select(nodes: Array<TreeNode>, extending?: boolean | null): void;
  // Selects the specified `TreeNode`s that are visible (nodes with collapsed ancestors cannot be selected). If `extending` is `true`, the existing selection is not cleared.
  copyNodes(nodes: Array<TreeNode>, to: Pasteboard): void;
  // Writes a serialized version of the `nodes` to the specified pasteboard.
  paste(from: Pasteboard, parentNode?: TreeNode | null, childIndex?: number | null): void;
  // Attempts to read a serialized version of nodes from the pasteboard and create new items at the specified location in the receiver. If a parent node is not specified, then the root node of the receiver is assumed. If a `childIndex` is not specified, any new children are placed at the end of the parent's existing children.
  readonly rootNode: TreeNode;
  // Returns the `rootNode` of the `Editor`.
  readonly selectedNodes: Array<TreeNode>;
  // Returns the list of selected `TreeNode`s, in the order they appear in the tree.
}

// ContentTree

declare class ContentTree extends Tree {}

// SidebarTree

declare class SidebarTree extends Tree {
  // The root object of a tree in the sidebar.
}

// TreeNode

declare class TreeNode {
  childAtIndex(childIndex: number): TreeNode;
  // Returns the child node at the given index.
  expand(completely?: boolean | null): void;
  // Attempts to expand the `TreeNode`. If `completely` is passed, all the child nodes will be expanded as they allow.
  collapse(completely?: boolean | null): void;
  // Attempts to collapse the `TreeNode`. If `completely` is passed, all the child nodes will be collapse as they allow.
  expandNote(completely?: boolean | null): void;
  // Attempts to expand the inline note of the `TreeNode`. If `completely` is passed, all the child node notes will be expanded.
  collapseNote(completely?: boolean | null): void;
  // Attempts to collapse the inline note of the `TreeNode`. If `completely` is passed, all the child node notes will be collapsed.
  reveal(): void;
  // Expands all the
  apply(f: (node: TreeNode) => ApplyResult | null): ApplyResult | null;
  // Calls the supplied function for each `TreeNode` in the receiver (including the receiver), passing that node as the single argument. The supplied function can optionally return a `ApplyResult` to skip enumeration of some elements.
  readonly canCollapse: boolean;
  // Returns `true` if this `TreeNode` can be collapsed.
  readonly canExpand: boolean;
  // Returns `true` if this `TreeNode` can be expanded.
  readonly childCount: number;
  // Returns the number of children directly under this node.
  readonly children: Array<TreeNode>;
  // Returns the array of children that are visible under this node, according to any filtering that is being done, and in the order specified by any sorting rules that have been established.
  readonly index: number;
  // Returns the index of this `TreeNode` among its siblings, or zero for the `rootNode`.
  readonly isExpanded: boolean;
  // Returns `true` if this `TreeNode` is currently expanded.
  readonly isNoteExpanded: boolean;
  // Returns `true` if the note of this `TreeNode` is currently expanded.
  readonly isRevealed: boolean;
  // Returns `true` if the `TreeNode` is the `rootNode` or all of its ancestor nodes are expanded.
  readonly isRootNode: boolean;
  // Returns `true` if this node is the `rootNode` of its tree.
  readonly isSelectable: boolean;
  // Returns `true` if this `TreeNode` can be selected. The `rootNode` cannot be selected, nor can nodes that aren't revealed.
  isSelected: boolean;
  // Set to `true` if this `TreeNode` is in the list of selected nodes for its tree. Attempting to set this to `true` will do nothing if the node is not revealed (or is the root node).
  readonly level: number;
  // Returns the nesting level of the `TreeNode`, relative to the root of the tree. The `rootNode` of an `Outline` has level zero, its children have level one, and so on. Note that if only a portion of the model is being shown, this level may not match the level of the underlying `object`.
  readonly object: Object;
  // The model object which this node wraps.
  readonly parent: TreeNode | null;
  // Returns the `TreeNode` that contains this node, or `null` if this is the `rootNode`.
  readonly rootNode: TreeNode;
  // Returns the root `TreeNode` for the tree that this node belongs to.
}

// TypeIdentifier

declare namespace TypeIdentifier {
  function fromPathExtension(pathExtension: string, isDirectory: boolean): TypeIdentifier;
  // Return a `TypeIdentifier` that matches items that have the given path extension and are (or are not) directories.
  const URL: TypeIdentifier; // The URL type.
  const binaryPropertyList: TypeIdentifier; // The binary property list type.
  const csv: TypeIdentifier; // The comma-separated text type.
  const editableTypes: Array<TypeIdentifier>;
  // The list of `TypeIdentifier`s that can be read and written natively by documents in this application.
  const gif: TypeIdentifier; // The GIF image type.
  const image: TypeIdentifier;
  // A generic type that all image types conform to.
  const jpeg: TypeIdentifier; // The JPEG image type.
  const json: TypeIdentifier; // The JSON type.
  const ofocus: TypeIdentifier; // The OmniFocus document file type.
  const pdf: TypeIdentifier; // The PDF type.
  const plainText: TypeIdentifier;
  // The plain text type (public.plain-text). Primarily used for conformance tests (i.e. is this other type a type of text). See also .utf8PlainText.
  const png: TypeIdentifier; // The PNG image type.
  const propertyList: TypeIdentifier; // The generic property list type.
  const readableTypes: Array<TypeIdentifier>;
  // The list of `TypeIdentifier`s that can be read by documents in this this application.
  const rtf: TypeIdentifier; // The RTF type.
  const rtfd: TypeIdentifier; // The RTFD type.
  const taskPaper: TypeIdentifier;
  // The TaskPaper-formatted tasks pasteboard type.
  const tasks: TypeIdentifier;
  // The pasteboard type identifier for OmniFocus tasks and projects.
  const tasksAndFolders: TypeIdentifier;
  // The pasteboard type identifier for OmniFocus tasks, projects, and folders.
  const tiff: TypeIdentifier; // The TIFF image type.
  const utf8PlainText: TypeIdentifier;
  // The UTF-8 plain text type (public.utf8-plain-text). This is the type used by Pasteboard.string.
  const writableTypes: Array<TypeIdentifier>;
  // The list of `TypeIdentifier`s that can be written by documents in this application (though some documents may be exportable only in a subset of these types).
  const xmlPropertyList: TypeIdentifier; // The XML property list type.
}

declare class TypeIdentifier {
  constructor(identifier: string);
  // Returns a new `TypeIdentifier` with the given identifier.
  conformsTo(other: TypeIdentifier): boolean;
  // Returns `true` if the instance is the same as the given argument or a more specific type. For example, `TypeIdentifier.png.conformsTo(TypeIdentifier.image)` will be `true`, but `TypeIdentifier.png.conformsTo(TypeIdentifier.plainText)` will be `false`.
  readonly displayName: string;
  // Returns a human-readable description of the type.
  readonly identifier: string;
  // Returns a unique string for a type identifier, suitable for archiving or encoding in scripts.
  readonly pathExtensions: Array<string>;
  // The list of filesystem path extensions used by this type.
}

// URL

declare namespace URL {
  function choose(types: Array<string>): URL | null;
  // Deprecated: Please use `FilePicker` instead.
  // Allows the user to choose a file `URL` if possible and returns a new instance, or `null` otherwise.
  function chooseFolder(): URL | null;
  // Deprecated: Please use `FilePicker` instead.
  // Allows the user to choose a folder `URL` if possible and returns a new instance, or `null` otherwise.
  function fromString(string: string, relativeToURL?: URL | null): URL | null;
  // Parses the string as a `URL` if possible and returns a new instance, or `null` if the string is not a valid URL. If `baseURL` is not `null`, the result is a relative URL.
  function fromPath(path: string, isDirectory: boolean, relativeToURL?: URL | null): URL;
  // Returns a new `file` URL with the given path and assumption of whether it is a directory.
  function tellScript(app: string, js: string, arg?: Object | null): URL | null;
  // Creates a `URL` to invoke the given JS on the given app (url scheme) appropriate for use with the call function.
  function tellFunction(app: string, jsFunction: Function, arg?: Object | null): URL | null;
  // Creates a `URL` to invoke the given JS function on the given app (url scheme) appropriate for use with the call function.
  function omniLink(path: string, folderName: string): URL;
  // Constructs an Omni Link for a given path inside a Connected Folder.
  function resolveFileURLForOmniLink(
    omniLink: URL,
    additionalPromptMessage?: string | null,
    additionalQueryItems?: Array<URL.QueryItem> | null,
  ): Promise<URL>;
  // Resolves an Omni Link into a file URL.
  function omniLinkForFileURL(
    fileURL: URL,
    additionalQueryItems?: Array<URL.QueryItem> | null,
    additionalPromptMessage?: string | null,
  ): Promise<URL>;
  // Generates an Omni Link from a file URL, with optional parameters for additional query items and prompt message text.
  const currentAppScheme: string;
  // Returns the URL scheme for the current app.
  const documentsDirectory: URL;
  // Returns the application's Documents directory. This is in the application's sandbox, and on the Mac is <b>not</b> the user's Documents directory. This is accessible by the application without using `access()`.
}

declare class URL {
  fetch(success: (contents: Data) => void, failure?: (error: Error) => void | null): void;
  // Get the contents at the destination of this URL.
  call(success: Function, failure?: Function | null): void;
  // Invoke an [x-callback-url API](http://x-callback-url.com) end-point, with the callback functions being invoked when a reply is received. When a reply is received, the parameters of that URL are decoded as JSON, or left as String values if not valid JSON, and stored as properties of a result object. For a successful reply, if the result object has one property, its value is passed as the first argument to the success function. If there are zero or more than one parameters, the full object is passed as the first argument. In both cases, the success function is passed a second argument that is the full object of parameters. The failure callback is always passed the object will all the result parameters, typically `errorCode` and `errorMessage`.
  open(): void;
  // Ask the system to open this URL.
  revealFile(): Promise<boolean>;
  // Ask the system to reveal a file URL.
  find(types: Array<TypeIdentifier>, recurse?: boolean | null): Promise<Array<URL>>;
  // Scan a directory `URL` for files of the given types. If `recurse` is specified and is false, only the immediate contents of the directory will be considered. If `recurse` is not specified or is `true`, the full directory tree will be scanned.
  toString(): string;
  appendingPathComponent(component: string): URL;
  // Return a new `URL` with the given string added at the end of the path.
  appendingPathExtension(pathExtension: string): URL;
  // Returns a new `URL` with the last path component having the given path extension added, including a separating "."
  deletingPathExtension(): URL;
  // Returns a new `URL` with the path extension (if any) of the last path component removed.
  deletingLastPathComponent(): URL;
  // Returns a new `URL` with the last path component removed.
  readonly absoluteString: string;
  // Returns the absolute string for the `URL`.
  readonly absoluteURL: URL; // Returns the absolute `URL`.
  readonly baseURL: URL | null;
  // Returns the base `URL` if this `URL` is relative, or `null` if it is absolute.
  readonly fragment: string | null;
  // Returns the fragment component of the `URL`, or `null`.
  readonly hasDirectoryPath: boolean;
  // Returns `true` if the `URL`'s path represents a directory.
  readonly host: string | null;
  // Returns the host component of the `URL` or `null`.
  readonly isFileURL: boolean;
  // Returns `true` if the scheme is `file:`.
  readonly lastPathComponent: string;
  // Returns the last component of the `URL`'s path or an empty string.
  readonly password: string | null;
  // Returns the password component of the `URL` or `null`.
  readonly path: string | null;
  // Returns the path component of the `URL` or `null`.
  readonly pathComponents: Array<string>;
  // Returns the path of the `URL` as an array of components.
  readonly pathExtension: string;
  // Returns the path extension of the last path component of the `URL` or the empty string.
  readonly port: number | null;
  // Returns the port component of the `URL` or `null`.
  readonly query: string | null;
  // Returns the query component of the `URL` or `null`.
  readonly relativePath: string | null;
  // Returns the relative path of the URL, or the absolute path if this `URL` is not relative
  readonly relativeString: string;
  // Returns the relative portion of the `URL` if it is relative, otherwise this returns the absolute string.
  readonly scheme: string | null; // Returns the scheme of the `URL`.
  readonly string: string;
  // String absoluteString representation of this URL.
  readonly user: string | null;
  // Returns the user component of the `URL` or `null`.
}

// URL.Access

declare namespace URL {
  class Access {
    // A `URL.Access` holds the temporary access given by the `URL.Bookmark.access()` function. These should not be stored longer than needed.
    readonly url: URL; // The `URL` being accessed.
  }
}

// URL.Bookmark

declare namespace URL.Bookmark {
  function fromURL(url: URL): URL.Bookmark;
  // Creates a `URL.Bookmark` from an existing `URL`, which should have been returned by `FilePicker`. This can then be stored in a `Credentials` object to persistently record the permission to access this `URL`.
}

declare namespace URL {
  class Bookmark {
    // A `URL.Bookmark` records the permission to access a given `URL` and will restore that permission, as well as a possibly renamed file, at a later point.
    access(): Promise<URL.Access>;
    // Attempts to resolve the instance into a `URL` and grant access to it through the returned `Promise`. Access to the `URL` will only last as long as the `URL.Access` object exists (which should not be stored longer than necessary).
  }
}

// URL.Components

declare namespace URL.Components {
  function fromString(string: string): URL.Components | null;
  // Parses the string into `URL.Components`. If the string is not a valid URL, `null` is returned.
  function fromURL(url: URL, resolvingAgainstBaseURL: boolean): URL.Components | null;
  // Parses the string represenation of the `URL`. If the `URL`'s string is malformed, `null` is returned. If `resolve` is `true` and the given `url` is relative, its base URL's components are considered.
}

declare namespace URL {
  class Components {
    // `URL.Components` allows for correct generation and interpreation of `URL` instances, dealing with the specific different quoting rules for each specific part of the `URL`.
    constructor();
    // Returns a new `URL.Components`.
    urlRelativeTo(base?: URL | null): URL | null;
    // Returns a `URL` relative to the base URL and the components or `null`.
    fragment: string | null;
    host: string | null;
    password: string | null;
    path: string;
    port: number | null;
    query: string | null;
    queryItems: Array<URL.QueryItem> | null;
    // The query of the `URL.Components` as individual components.
    scheme: string | null;
    readonly url: URL | null;
    // Returns a `URL` for the components or `null`.
    user: string | null;
  }
}

// URL.FetchRequest

declare namespace URL.FetchRequest {
  function fromString(string: string): URL.FetchRequest | null;
  // Parses the string as a `URL` if possible and returns a new instance, or `null` otherwise.
}

declare namespace URL {
  class FetchRequest {
    // `URL.FetchRequest` represents a request for a URL resource, providing additional controls for the request (such as the HTTP method, headers, and cache controls) and uses a Promise-based API for actually performing the request and receiving a detailed response (which includes the HTTP status code and headers along with the body of the result—see `URL.FetchResponse` for more detail).
    constructor();
    // Creates a new instance.
    fetch(): Promise<URL.FetchResponse>;
    // Perform the request, returning a `Promise`. On success, the promise will resolve to a `URL.FetchResponse`.
    allowsConstrainedNetworkAccess: boolean;
    // Whether connections may use the network when the user has specified Low Data Mode.
    allowsExpensiveNetworkAccess: boolean;
    // Whether connections may use a network interface that the system considers expensive.
    bodyData: Data | null;
    // The body of the request, typically used in an HTTP `POST` or `PUT` request. This API is suitable for uploading binary data, or for text which needs to be encoded in a form other than UTF-8. If UTF-8 text is suitable, `bodyString` is likely to be a better choice.
    bodyString: string | null;
    // The body of the request, typically used in an HTTP `POST` or `PUT` request. The provided string will be transmitted using the UTF-8 encoding.
    cache: string | null;
    // The cache policy for the request: `default`, `no-store`, `reload`, `no-cache`, `force-cache`, or `only-if-cached`.
    headers: object;
    // Custom HTTP headers to be sent with this request.
    httpShouldHandleCookies: boolean;
    // Whether to automatically handle cookies.
    httpShouldUsePipelining: boolean;
    // Whether to transmit data before receiving a response from an earlier request.
    method: string | null;
    // The HTTP request method of the request: `GET`, `POST`, `PUT`, `DELETE`, etc.
    url: URL | null;
    // The URL for this fetch request. Much of the additional functionality provided by the fetch request API will only work with `http` and `https` URLs. (For example, the `method` and `cache` and `headers` don't have any effect in the context of a `file` or `omnifocus` URL.)
  }
}

// URL.FetchResponse

declare namespace URL {
  class FetchResponse {
    // `URL.FetchResponse` represents the response from fetching a URL resource, providing additional information about the response such as the HTTP status code and headers along with the actual data for that response. This is a read-only object returned by performing a `URL.FetchRequest`; see that class for more details on actually performing the request.
    readonly bodyData: Data | null;
    // Returns the raw HTTP body data from this response.
    readonly bodyString: string | null;
    // This is a convenience wrapper which interprets the `bodyData` of this response as UTF-8 text. (Note: the current implementation assumes the text is encoded using UTF-8, but ideally it would honor the text encoding as reported by `textEncodingName`.)
    readonly headers: object;
    // Returns the HTTP header fields for this response.
    readonly mimeType: string | null;
    // Returns the HTTP MIME type for this response (e.g. `text/plain`, `application/json`, etc.).
    readonly statusCode: number;
    // Returns the HTTP status code for this response (e.g. `200`, `404`, etc.).
    readonly textEncodingName: string | null;
    // Returns the reported text encoding for this response. This name will be the actual string reported by the origin source, or `null` if no encoding was specified.
    readonly url: URL | null; // Returns the URL for this response.
  }
}

// URL.QueryItem

declare namespace URL {
  class QueryItem {
    constructor(name: string, value?: string | null);
    // Returns a new `URL.QueryItem` with the given name and value.
    readonly name: string;
    readonly value: string | null;
  }
}

// UnderlineAffinity

declare namespace UnderlineAffinity {
  const ByWord: UnderlineAffinity;
  // Underline only the words, but not the space between them.
  const None: UnderlineAffinity; // Underline the entire range.
  const all: Array<UnderlineAffinity>;
}

declare class UnderlineAffinity {}

// UnderlinePattern

declare namespace UnderlinePattern {
  const Dash: UnderlinePattern; // Dashed line.
  const DashDot: UnderlinePattern; // Alternating dashes and dots.
  const DashDotDot: UnderlinePattern; // Alternating dashes and pairs of dots.
  const Dot: UnderlinePattern; // Dotted line.
  const Solid: UnderlinePattern; // A continuous line.
  const all: Array<UnderlinePattern>;
}

declare class UnderlinePattern {}

// UnderlineStyle

declare namespace UnderlineStyle {
  const Double: UnderlineStyle; // Two lines.
  const None: UnderlineStyle; // No underline.
  const Single: UnderlineStyle; // A single line.
  const Thick: UnderlineStyle; // A single thick line.
  const all: Array<UnderlineStyle>;
}

declare class UnderlineStyle {}

// Version

declare class Version {
  constructor(versionString: string);
  // Parses a string representation of a `Version` and returns an instance, or throws an error if the string isn't a valid version.
  equals(version: Version): boolean;
  // Returns true if the receiving `Version` is equal to the argument `Version`.
  atLeast(version: Version): boolean;
  // Returns true if the receiving `Version` is at the same as or newer than the argument `Version`.
  isAfter(version: Version): boolean;
  // Returns true if the receiving `Version` is strictly after the argument `Version`.
  isBefore(version: Version): boolean;
  // Returns true if the receiving `Version` is strictly before the argument `Version`.
  readonly versionString: string;
  // Returns as an opaque string representation of the `Version`, suitable for display or logging. This should never be used in comparisons of any sort.
}

// Window

declare class Window {
  close(): void;
}

// DocumentWindow

declare class DocumentWindow extends Window {
  selectObjects(objects: Array<DatabaseObject>): void;
  // Clears the current selection and then selects the given objects in the content area, if present in the current perspective of this window.
  forecastDayForDate(date: Date): ForecastDay;
  // Returns a `ForecastDay` object that encompasses `date`. This will throw an error if Forecast is not the current perspective in this window.
  selectForecastDays(days: Array<ForecastDay>): void;
  // Selects the days in the Forecast picker represented by `days`. This will throw an error if Forecast is not the current perspective in this window.
  readonly content: ContentTree | null;
  // The tree of nodes representing the content area of the window.
  focus: SectionArray | null;
  // The Folders and Projects that the window is focusing on, limiting the sidebar to show only these items.
  inspectorVisible: boolean;
  // Whether the inspector is currently visible in the window. On iOS, showing this pane may implicitly hide other panes and may be only transiently visible, depending on the available space.
  readonly isCompact: boolean;
  // Whether the window is in compact layout, where extra panes like the sidebar and inspector are shown atop the content instead of side-by-side.
  readonly isTab: boolean;
  // Whether or not this window is a tab. This only returns true on macOS.
  perspective: Perspective.BuiltIn | Perspective.Custom | null;
  // The currently selected perspective in this `Window`.
  readonly selection: Selection; // The current selection in the window.
  readonly sidebar: SidebarTree | null;
  // The tree of nodes representing the sidebar of the window.
  sidebarVisible: boolean;
  // Whether the sidebar is currently visible in the window. On iOS, showing this pane may implicitly hide other panes and may be only transiently visible, depending on the available space.
  readonly tabGroupWindows: Array<DocumentWindow>;
  // The array of sibling `Window` objects that are in tabs alongside this `Window`. If `isTab` is false, then this will return an array that solely contains this `Window`.
  toolbarVisible: boolean;
  // Whether the toolbar is currently visible in the window. This only returns false on macOS; the toolbar is always visible on iOS and visionOS.
}

// XML

declare class XML {}

// XML.Document

declare namespace XML.Document {
  function fromData(data: Data, whitespaceBehavior?: XML.WhitespaceBehavior | null): XML.Document;
  // Parse the given data as an XML document.
}

declare namespace XML {
  class Document {
    constructor(rootElement: string | XML.Element, configuration?: XML.Document.Configuration | null);
    // Returns a new `XML.Document` with the given root element and configuration.
    xmlData(): Data;
    // Encodes the document as XML.
    addElement(name: string, f?: () => void | null): void;
    // Appends a new element with the given name. If a function is passed, it is pushed it on the current element stack, the supplied function is called, and then the element is popped off the stack.
    appendString(string: string): void;
    // Appends the given string as a child of `topElement`.
    setAttribute(attribute: string, value?: string | null): void;
    // Sets the specified attribute on `topElement`.
    readonly dtdPublicID: string | null;
    readonly dtdSystemID: URL | null;
    readonly rootElement: XML.Element;
    readonly schemaID: URL | null;
    readonly schemaNamespace: string | null;
    readonly stringEncoding: StringEncoding;
    readonly topElement: XML.Element;
    // Returns the element at the top of the current element stack. Intially this is the root element, but when `addElement()` is called, it is temporarily updated to the new element (possibly recursively).
    readonly whitespaceBehavior: XML.WhitespaceBehavior;
  }
}

// XML.Document.Configuration

declare namespace XML.Document {
  class Configuration {
    constructor();
    // Returns a new `XML.Document.Configuration` with default settings.
    dtdPublicID: string | null;
    dtdSystemID: URL | null;
    schemaID: URL | null;
    schemaNamespace: string | null;
    stringEncoding: StringEncoding;
    whitespaceBehavior: XML.WhitespaceBehavior | null;
  }
}

// XML.Element

declare namespace XML {
  class Element {
    constructor(name: string);
    // Returns a new `XML.Element` with the given name.
    childAtIndex(childIndex: number): string | XML.Element | null;
    // Returns the child at the given index, or nil if the index is past the last child.
    insertChild(child: string | XML.Element, childIndex: number): void;
    // Inserts the new child at the specified index. If the index is past the end of the current children, it is appended instead.
    appendChild(child: string | XML.Element): void;
    // Adds the new item to the end of the children.
    removeChildAtIndex(childIndex: number): void;
    // Removes the child at the given index. If the index is past the end of the current children, no removal occurs.
    removeAllChildren(): void;
    // Removes any existing children.
    firstChildNamed(name: string): XML.Element | null;
    // Returns the first child element with the given name, or `null` if there is no such child.
    firstChildAtPath(path: string): XML.Element | null;
    // Given a `path` which is a string separated by `"/"`, returns the first element at that path.
    firstChildWithAttribute(attribute: string, value: string): XML.Element | null;
    // Returns the first child with an attribute set to the given value.
    attributeNamed(name: string): string | null;
    // Returns the value of the the given attribute or `null` if no value has been assigned.
    setAttribute(name: string, value?: string | null): void;
    // Sets the value for the specified attribute. If the element already had a value for this attribute, it is replaced in place. If there previously was no value for this attribute, the attribute is appended to `attributeNames`. If the new value is `null`, the attribute is removed.
    apply(f: (node: string | XML.Element) => ApplyResult | null): ApplyResult | null;
    // Calls the supplied function for each child element or string in the receiver (including the receiver), passing that child as the single argument. The supplied function can optionally return a `ApplyResult` to skip enumeration of some elements.
    readonly attributeCount: number;
    // Returns the number of attributes assigned to this element.
    readonly attributeNames: Array<string>;
    // Returns the names of the attributes in the order they were added to the element.
    children: Array<string | XML.Element>;
    // The current child strings and elements.
    readonly childrenCount: number;
    // Returns the current count of child strings and elements.
    readonly lastChild: string | XML.Element | null;
    // Returns the last child of the element, or `null` if there are no children.
    readonly name: string; // Returns the name of the element.
    readonly stringContents: string;
    // Gathers all the immediate and descendent string children and returns them concatenated them as single string.
  }
}

// XML.WhitespaceBehavior

declare namespace XML {
  class WhitespaceBehavior {
    constructor(defaultBehavior: XML.WhitespaceBehavior.Type);
    // Returns a new `XML.WhitespaceBehavior` with the given default type.
    setBehaviorForElementName(behavior: XML.WhitespaceBehavior.Type, elementName: string): void;
    behaviorForElementName(elementName: string): XML.WhitespaceBehavior.Type;
    readonly defaultBehavior: XML.WhitespaceBehavior.Type;
  }
}

// XML.WhitespaceBehavior.Type

declare namespace XML.WhitespaceBehavior.Type {
  const Auto: XML.WhitespaceBehavior.Type;
  // Inherit the behavior from the enclosing element
  const Ignore: XML.WhitespaceBehavior.Type; // Ignore whitespace
  const Preserve: XML.WhitespaceBehavior.Type; // Preserve whitespace
  const all: Array<XML.WhitespaceBehavior.Type>;
}

declare namespace XML.WhitespaceBehavior {
  class Type {}
}
