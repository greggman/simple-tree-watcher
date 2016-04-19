'use strict';

const debug = require('../lib/debug')('test-fs');
const fs = require('fs');
const path = require('path');

class TestFS {
  constructor() {
    this.createdFiles = [];
    this.createdDirs = [];
  }

  writeFile(path, content) {
    fs.writeFileSync(path, content, {encoding: "utf8"});
    this.createdFiles.push(path);
  }

  mkdir(path) {
    fs.mkdirSync(path);
    this.createdDirs.push(path);
  }

  makeFS(dirName, spec, initialContent) {
    this.mkdir(dirName);
    spec.files.forEach((fileName) => {
      var fullPath = path.join(dirName, fileName);
      this.writeFile(fullPath, initialContent);
    });
    if (spec.dirs) {
      spec.dirs.forEach((dirSpec) => {
        this.makeFS(path.join(dirName, dirSpec.name), dirSpec, initialContent);
      });
    }
  }

  mv(src, dst) {
    debug("mv:", src, dst);
    fs.renameSync(src, dst);

    function subName(fileName) {
      var newPath = fileName;
      if (fileName.substr(0, src.length) === src) {
        newPath = dst + fileName.substr(src.length);
      }
      return newPath;
    }

    this.createdFiles = this.createdFiles.map(subName);
    this.createdDirs = this.createdDirs.map(subName);
  }

  cleanup() {
    this.createdFiles.reverse().forEach(function(fileName) {
      if (fs.existsSync(fileName)) {
        debug("rm:", fileName);
        fs.unlinkSync(fileName);
      }
    });
    this.createdDirs.reverse().forEach(function(fileName) {
      if (fs.existsSync(fileName)) {
        debug("rmdir:", fileName);
        fs.rmdirSync(fileName);
      }
    });

    this.createdFiles = [];
    this.createdDirs = [];
  }
}

module.exports = TestFS;


