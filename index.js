/* eslint-env node */
/* eslint-disable ember/avoid-leaking-state-in-ember-objects */
'use strict';
const BasePlugin = require('ember-cli-deploy-plugin');
const rp = require('request-promise');
const path = require('path');
const fs = require('fs');

module.exports = {
  name: 'ember-cli-deploy-raygun',
  init() {
    this._super(...arguments);

  },
  createDeployPlugin(options) {
    let DeployPlugin = BasePlugin.extend({
      name: options.name,
      requiredConfig: ['key', 'token'],
      defaultConfig: {
        revisionKey: function(context) {
          var revisionKey = context.revisionData && context.revisionData.revisionKey;
          return context.commandOptions.revision || revisionKey;
        }
      },

      runAfter: 'revision-data',

      didDeploy(context) {
        this.log('Creating Raygun Deployment');

        return rp({
          method: 'POST',
          url: 'https://app.raygun.io/deployments?authToken=' + this.readConfig('token'),
          json: true,
          body: {
            apiKey: this.readConfig('key'),
            version: this.readConfig('revisionKey'),
            ownerName: 'olo'
          }
        })
        .then(() => {
          let mapFiles = context.distFiles ? context.distFiles.filter((file) => file.endsWith('.map')) : [];

          if (mapFiles.length) {
            let prefix = this.readConfig('prefix');
            let appId = this.readConfig('appId');

            if (!prefix) {
              this.log('You must provide prefix config to upload sourcemaps to Raygun - Skipping stage', {
                color: 'red'
              });
              return;
            }

            if (!appId) {
              this.log('You must provide appId config to updload sourcemaps to Raygun - Skipping stage', {
                color: 'red'
              });
            }


            this.log('Uploading sourcemaps to Raygun');

            let promises = mapFiles.map((file) => {
              // match the sourcemap with the distfile
              let mapFileRoot = file.split('-').slice(0, -1);

              let matchingDistFile = context.distFiles
                .filter((distFile) => !distFile.endsWith('.map'))
                .find((distFile) => {
                  let fingerPrintRegex = /(.*)-[\w]{32}.js/;

                  if (distFile.match(fingerPrintRegex)) {
                    let mapFileResults = /(.*)-[\w]{32}.map/.exec(file);
                    let distFileResults = fingerPrintRegex.exec(distFile);

                    return distFileResults[1] === mapFileResults[1]
                  } else if (distFile.endsWith('.js')) {
                    return file.slice(0, -4) === distFile.slice(0, -3);
                  }
                });

              if (!matchingDistFile) {
                this.log(`No matching dist file for ${file}`, {
                  color: 'red'
                });
                return Q();
              }

              return rp({
                method: 'POST',
                url: `https://app.raygun.io/upload/jssymbols/${this.readConfig('appId')}?authToken=${this.readConfig('token')}`,
                formData: {
                  url: this.readConfig('prefix') + file,
                  file: fs.createReadStream(path.join(context.project.root, context.distDir, file))
                }
              });
            })

            return Q.all(promises);
          }
        })
        .then(() => {
          this.log('Raygun updated successfully');
        }, (err) => {
          this.log('Error setting deployment' + err.message, {
            color: 'red'
          });
        });
      }
    });

    return new DeployPlugin();
  }
};
