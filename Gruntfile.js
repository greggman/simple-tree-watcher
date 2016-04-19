"use strict";

module.exports = function(grunt) {

  require('load-grunt-tasks')(grunt);

  grunt.initConfig({
    eslint: {
      lib: {
        src: [
          'index.js',
          'test',
        ],
        options: {
          configFile: 'build/conf/eslint.json',
          //rulesdir: ['build/rules'],
        },
      },
    },
  });

  grunt.registerTask('default', 'eslint');
};

