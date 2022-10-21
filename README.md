#Google Form Exporter

This Google App Script takes a Google form and downloads it as a JSON file. It can be used in combination with [Json2GForm](https://github.com/SableRaf/Json2GForm/) to create a new form from the exported JSON file.

This script is based on [the work of Steven Schmatz](https://github.com/stevenschmatz/export-google-form).

## Known issues
There is seemingly no way to handle items of the FILE_UPLOAD type (see [this issue](https://github.com/stevenschmatz/export-google-form/issues/4))