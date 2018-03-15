/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for t`he specific language governing permissions and
 * limitations under the License.
 */
'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const functions = require("firebase-functions");
const mkdirp = require("mkdirp-promise");
const gcsAPI = require("@google-cloud/storage");
const admin = require("firebase-admin");
const child_process_promise_1 = require("child-process-promise");
const path = require("path");
const os = require("os");
const fs = require("fs");
// HACK HACK HACK
// We don't yet support environment variables:
functions.config = () => {
    return {
        firebase: {
            databaseURL: "https://kits-testing.firebaseio.com",
            projectId: "kits-testing",
            storageBucket: "kits-testing.appspot.com",
            credential: admin.credential.applicationDefault()
        }
    };
};
// Default initialize
const gcs = gcsAPI();
admin.initializeApp(functions.config().firebase);
exports.defaultOptions = {
    maxHeight: process.env.THUMB_MAX_HEIGHT ? Number.parseInt(process.env.THUMB_MAX_HEIGHT, 10) : 200,
    maxWidth: process.env.THUMB_MAX_WIDTH ? Number.parseInt(process.env.THUMB_MAX_WIDTH, 10) : 200,
    prefix: process.env.THUMB_PREFIX || 'thumb_',
    bucket: process.env.THUMB_BUCKET || functions.config().firebase.storageBucket,
    postProcess: postUploads,
};
/**
 * postUploads is the default post-processor GenerateThumbnail.
 */
function postUploads(bucket, original, thumbnail) {
    return __awaiter(this, void 0, void 0, function* () {
        yield admin.database().ref('images').push({ bucket, original, thumbnail });
        console.log('Thumbnail URLs saved to database.');
    });
}
/**
 * postSignedUploads is the post-processor for GenerateThumbnail that comes in the original sample.
 * Due to API limitations, this requires a GCS version that has been initialized with credentials and will
 * fail.
 * @param {string} bucket
 * @param {string} original
 * @param {string} thumbnail
 * @returns {Promise<void>}
 */
function postSignedUploads(bucket, original, thumbnail) {
    return __awaiter(this, void 0, void 0, function* () {
        const gcsBucket = gcs.bucket(bucket);
        const config = {
            action: 'read',
            expires: '03-01-2500'
        };
        const [thumbResult, originalResult] = yield Promise.all([
            gcsBucket.file(original).getSignedUrl(config),
            gcsBucket.file(thumbnail).getSignedUrl(config)
        ]);
        const thumbFileUrl = thumbResult[0];
        const fileUrl = originalResult[0];
        // Add the URLs to the Database
        yield admin.database().ref('images').push({ path: fileUrl, thumbnail: thumbFileUrl });
        console.log('Thumbnail URLs saved to database.');
    });
}
/**
 * @returns {Promise<void>}
 */
function generateThumbnail(options) {
    return __awaiter(this, void 0, void 0, function* () {
        const bucket = gcs.bucket(options.bucket);
        const fileDir = path.dirname(options.name);
        const fileName = path.basename(options.name);
        const thumbFilePath = path.normalize(path.join(fileDir, `${options.prefix}${fileName}`));
        const tempLocalFile = path.join(os.tmpdir(), options.name);
        const tempLocalDir = path.dirname(tempLocalFile);
        const tempLocalThumbFile = path.join(os.tmpdir(), thumbFilePath);
        yield mkdirp(tempLocalDir);
        const file = bucket.file(options.name);
        yield file.download({ destination: tempLocalFile });
        console.log('The file has been downloaded to', tempLocalFile);
        yield child_process_promise_1.spawn('convert', [tempLocalFile, '-thumbnail', `${options.maxWidth}x${options.maxHeight}>`, tempLocalThumbFile], { capture: ['stdout', 'stderr'] });
        // TODO: we don't have support for custom mutations on thumbnailed files. We don't know what to do with the file once
        // uploaded.
        console.log('Thumbnail created at', tempLocalThumbFile);
        // Uploading the Thumbnail.
        const metadata = { contentType: options.contentType };
        yield bucket.upload(tempLocalThumbFile, { destination: thumbFilePath, metadata: metadata });
        console.log('Thumbnail uploaded to Storage at', thumbFilePath);
        // Once the image has been uploaded delete the local files to free up disk space.
        fs.unlinkSync(tempLocalFile);
        fs.unlinkSync(tempLocalThumbFile);
        return thumbFilePath;
    });
}
exports.generateThumbnail = generateThumbnail;
function validateOptions(options) {
    if (!options.prefix) {
        throw new Error("Expected prefix");
    }
    if (!options.maxWidth) {
        throw new Error("Expected maxWidth");
    }
    if (!options.maxHeight) {
        throw new Error("Expected maxHeight");
    }
}
/**
 * When an image is uploaded in the Storage bucket We generate a thumbnail automatically using
 * ImageMagick.
 * After the thumbnail has been generated and uploaded to Cloud Storage,
 * we write the public URL to the Firebase Realtime Database.
 * TODO(inlined): Find a way to compile cleanly & easily with a more accurate type definition.
 */
function autoThumbnailer(options) {
    validateOptions(options);
    return functions.storage.bucket(options.bucket).object().onChange((event) => __awaiter(this, void 0, void 0, function* () {
        const { bucket, name, contentType } = event.data;
        // Exit if this is triggered on a file that is not an image.
        if (!contentType.startsWith('image/')) {
            console.log('This is not an image.');
            return null;
        }
        // Exit if the image is already a thumbnail.
        if (path.basename(name).startsWith(options.prefix)) {
            console.log('Already a Thumbnail.');
            return null;
        }
        // Exit if this is a move or deletion event.
        if (event.data.resourceState === 'not_exists') {
            console.log('This is a deletion event.');
            return null;
        }
        if (options.filter && !options.filter(event.data)) {
            console.log('Event filtered out');
            return null;
        }
        const thumbnail = yield generateThumbnail({
            bucket, name, contentType, maxHeight: options.maxHeight, maxWidth: options.maxWidth, prefix: options.prefix
        });
        if (options.postProcess) {
            yield options.postProcess(bucket, name, thumbnail);
        }
    }));
}
exports.autoThumbnailer = autoThumbnailer;
exports.default = authoThumbnailer(exports.defaultOptions);
exports = {
    default: autoThumbnailer(exports.defaultOptions)
};
//# sourceMappingURL=index.js.map
