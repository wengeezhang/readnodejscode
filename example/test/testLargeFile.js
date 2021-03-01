let fs = require('fs');

let fetch = require('node-fetch');

fetch('http://localhost:9095/',{

    method: 'post',
    headers: {
        'content-type': 'application/json'
    },
    body: JSON.stringify({
        f1: fs.readFileSync('./back_index.html', {encoding: 'utf8'})
    })
}).then(d => {
    console.log(111, d.status, d.ok);
    return d.text();
}).then(d => {
    console.log(22222, d);
})
