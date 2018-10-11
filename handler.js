'use strict';

const util = require("util");

const fetch = require('node-fetch');
const ical = require('node-ical');
const igen = require('ical-generator');

const CustomError = require('./custom-error');

const baseUrl = 'https://sirius.fit.cvut.cz/api/v1/people/%s/events.ical?access_token=%s';

module.exports.query = async (event, context) => {
    try {
        const username = event.pathParameters && event.pathParameters['username'];
        if (!username) {
            throw new CustomError('No username provided', 400);
        }

        const token = event.queryStringParameters && event.queryStringParameters['access_token'];
        if (!token) {
            throw new CustomError('No access token provided', 403);
        }

        const url = util.format(baseUrl, username, token);

        const response = await fetch(url);

        if (!response.ok) {
            const errorData = JSON.parse(await response.text());
            throw new CustomError(errorData['message'], errorData['status']);
        }

        const data = await response.text();

        const cal = await new Promise(function (resolve, reject) {
            ical.parseICS(data, function (err, data) {
                if (err) reject(err);
                else resolve(data);
            });
        });

        const newcal = igen({domain: 'fel.cvut.cz', name: username + '@CVUT'});

        for (let k in cal) {
            if (cal.hasOwnProperty(k)) {
                const ev = cal[k];

                let lecture = false;
                let seminar = false;
                let subject = '';

                if (!ev.categories) {
                    continue;
                }
                ev.categories.forEach(function(c) {
                    if (c === 'přednáška') {
                        lecture = true;
                    }
                    else if (c === 'cvičení') {
                        seminar = true;
                    }
                    else if (c.startsWith('FI-') || c.startsWith('B')) {
                        subject = c;
                    }
                });

                if (lecture && seminar || !subject) {
                    throw new CustomError('Invalid event', 500);
                }

                let ok = false;
                if (!lecture && !seminar) {
                    // something other
                    ok = true;
                }

                if (seminar && (subject !== 'B4M33PAL' && subject !== 'BEZM')) {
                    ok = true;
                }

                if (lecture && (subject === 'B4M39PGR2' || subject === 'B4M39APG')) {
                    ok = true;
                }

                if (ok) {
                    newcal.createEvent({
                        ...ev,
                        categories: ev.categories.map(function(c){ return {name: c}}),
                        url: ev.url + '?access_token=' + token,
                        timezone: 'Europe/Prague'
                    });
                }
            }
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/calendar'
            },
            body: newcal.toString(),
        };

    } catch (err) {
        console.log(err);
        if (err instanceof CustomError) {
            return {
                statusCode: err.statusCode,
                body: JSON.stringify({
                    message: err.message,
                }),
            };
        }
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: err.message,
            }),
        };
    }
};
