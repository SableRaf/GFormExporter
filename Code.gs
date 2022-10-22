// Based on https://github.com/stevenschmatz/export-google-form
//
// Known issues
// - There is no way to handle file upload items (https://github.com/stevenschmatz/export-google-form/issues/4)

// TO DOs
// - [ ] investigate why typedItem.getGoToPage() is always null on PAGE_BREAK items

var URL =
  "https://docs.google.com/forms/d/1Fb70JIKGymw67zmaLyotTZFny_rL6seUalbVtkvflYc/"; // dummy form
// var URL = "https://docs.google.com/forms/d/1uj8IP120ZkFCsW9nXrLWvXL1fEuChoR6h-uc53tguco/" // duplicates test
// var URL = "https://docs.google.com/forms/d/15_G4jFGimBUKhExguaKRnJl-ht-uZnjite_mqcULMEU/"; // alpha 0.3
// var URL = "https://docs.google.com/forms/d/1QhcDEVaPG1AixByawb09kGtCDHm--OHosZERknd3YAw/"; // alpha 0.4

// Runs when the spreadsheet starts, adds a tab at the top
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("Scripts").addItem("Download Form as JSON", "main").addToUi();
}

/**
 * Converts the given form URL into a JSON object.
 */
function main() {
  var json = getJSON_();
  dlFile_(JSON.stringify(json));
}

function debug() {
  var json = getJSON_();
  Logger.log(JSON.stringify(json));
}

function getJSON_() {
  var form = FormApp.openByUrl(URL);
  var items = form.getItems();

  var json = {
    metadata: getFormMetadata_(form),
    items: items.map(itemToObject_),
    count: items.length,
  };

  return json;
}

/**
 * Returns the form metadata object for the given Form object.
 * @param form: Form
 * @returns (Object) object of form metadata.
 */
function getFormMetadata_(form) {
  return {
    title: form.getTitle(),
    id: form.getId(),
    description: form.getDescription(),
    publishedUrl: form.getPublishedUrl(),
    editorEmails: form.getEditors().map(function (user) {
      return user.getEmail();
    }),
    count: form.getItems().length,
    confirmationMessage: form.getConfirmationMessage(),
    customClosedFormMessage: form.getCustomClosedFormMessage(),
  };
}

/**
 * Returns an Object for a given Item.
 * @param item: Item
 * @returns (Object) object for the given item.
 */
function itemToObject_(item) {
  var data = {};

  data.type = item.getType().toString();
  data.title = item.getTitle();

  // Downcast items to access type-specific properties
  var typeString = item.getType().toString();
  if (typeString === "DATETIME") typeString = "DATE_TIME"; // handle the corner case of DATETIME
  var itemTypeConstructorName = snakeCaseToCamelCase_(
    "AS_" + typeString + "_ITEM"
  );
  var typedItem = item[itemTypeConstructorName]();

  // Keys with a prefix of "get" have "get" stripped

  var getKeysRaw = Object.keys(typedItem).filter(function (s) {
    return s.indexOf("get") == 0;
  });

  getKeysRaw.map(function (getKey) {
    var propName = getKey[3].toLowerCase() + getKey.substr(4);

    // Image data, choices, and type come in the form of objects / enums
    if (["image", "choices", "type", "alignment"].indexOf(propName) != -1) {
      return;
    }

    // Skip feedback-related keys
    if (
      "getFeedbackForIncorrect" === getKey ||
      "getFeedbackForCorrect" === getKey ||
      "getGeneralFeedback" === getKey
    ) {
      return;
    }

    var propValue = typedItem[getKey]();

    data[propName] = propValue;
  });

  // Bool keys are included as-is

  var boolKeys = Object.keys(typedItem).filter(function (s) {
    return (
      s.indexOf("is") == 0 ||
      s.indexOf("has") == 0 ||
      s.indexOf("includes") == 0
    );
  });

  boolKeys.map(function (boolKey) {
    var propName = boolKey;
    var propValue = typedItem[boolKey]();
    data[propName] = propValue;
  });

  // Handle image data and list choices

  switch (item.getType()) {
    case FormApp.ItemType.LIST:
    case FormApp.ItemType.CHECKBOX:
      data.choices = typedItem.getChoices().map((choice) => choice.getValue());
      break;
    case FormApp.ItemType.MULTIPLE_CHOICE:
      data.choices = typedItem.getChoices().map((choice) => choice.getValue());
      var pages = [];
      var ids = [];
      typedItem.getChoices().forEach((choice) => {
        if (!isNull_(choice.getGotoPage())) {
          pages.push(choice.getGotoPage().getTitle());
          ids.push(choice.getGotoPage().getId());
        } else {
          pages.push(null);
          ids.push(null);
        }
      });
      if (!isArrayNull_(pages)) {
        data.goToPages = pages;
        data.goToIds = ids;
      }
      break;

    case FormApp.ItemType.IMAGE:
      data.alignment = typedItem.getAlignment().toString();

      if (item.getType() == FormApp.ItemType.VIDEO) {
        return;
      }

      var imageBlob = typedItem.getImage();

      data.imageBlob = {
        dataAsString: imageBlob.getDataAsString(),
        name: imageBlob.getName(),
        isGoogleType: imageBlob.isGoogleType(),
      };

      break;

    case FormApp.ItemType.PAGE_BREAK:
      data.pageNavigationType = typedItem.getPageNavigationType().toString();
      if (!isNull_(typedItem.getGoToPage())) {
        // TO DO: figure out why typedItem.getGoToPage() is always null
        data.goToPage = typedItem.getGoToPage().getTitle();
      }
      break;

    default:
      break;
  }

  // Have to do this because for some reason Google Scripts API doesn't have a
  // native VIDEO type
  if (item.getType().toString() === "VIDEO") {
    data.alignment = typedItem.getAlignment().toString();
  }

  return data;
}

// Run when you click "Download a file!"
function dlFile_(blob) {
  let timestampString = new Date().toISOString().replace(/[-:_.]/g, "");
  let file = DriveApp.getRootFolder().createFile(
    `formExport-${timestampString}.json`,
    blob
  );

  // Create little HTML popup with the URL of the download
  let htmlTemplate = HtmlService.createTemplateFromFile("Download.html");
  htmlTemplate.dataFromServerTemplate = { url: file.getDownloadUrl() };

  let html = htmlTemplate.evaluate().setWidth(400).setHeight(300);

  SpreadsheetApp.getUi().showModalDialog(html, "Download");
}

/**
 * Converts a SNAKE_CASE string to a camelCase string.
 * @param s: string in snake_case
 * @returns (string) the camelCase version of that string
 */
function snakeCaseToCamelCase_(s) {
  return s.toLowerCase().replace(/(\_\w)/g, function (m) {
    return m[1].toUpperCase();
  });
}

function isNull_(objectToTest) {
  return typeof objectToTest === "object" && !objectToTest;
}

// if every item in array is null return false
function isArrayNull_(array) {
  return array.every(function (x) {
    return x === null;
  });
}
