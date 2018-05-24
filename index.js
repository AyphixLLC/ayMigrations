var fs = require("fs");
var path = require("path");
var argv = require('minimist')(process.argv.slice(2));
var jsonFormat = require("json-format");
var _ = require("lodash");

var tables = {};

if (argv._[0] == "init") {
    new Promise(function (resolve, reject) {
        if (!fs.existsSync("./migrate_config/")) {
            fs.mkdir("./migrate_config/", function (err) {
                if (err) {
                    console.log(err);
                    reject();
                }
            });
        }

        if (!fs.existsSync("./migrate_config/config.json")) {
            fs.writeFile("./migrate_config/config.json",
                jsonFormat({
                    database: {
                        host: "localhost",
                        database: "",
                        username: "",
                        password: ""
                    },
                    models_file: "models.json"
                },{type: 'space',
                size: 4}),
                function (err) {
                    if (err) {
                        console.log(err);
                        reject();
                    }
                });
        }
        if (!fs.existsSync("./migrate_config/models.json")) {
            fs.writeFile("./migrate_config/models.json",
            jsonFormat([],{type: 'space',
            size: 4}),
                function (err) {
                    if (err) {
                        console.log(err);
                        reject();
                    }
                    resolve();
                });
        }
    }).then(function () {
        console.log("Initialized project!");
    }).catch(function () {

    });
}

function getConnection() {
    var config = require('./migrate_config/config.json');

    const mysql = require('mysql2');

    return mysql.createConnection({
        host: config.database.host,
        user: config.database.username,
        password: config.database.password,
        database: config.database.database
    });
}

function parseTable(table) {
    var conn = getConnection();

    if (!tables[table]) {
        tables[table] = {};
        tables[table].fields = {};
    }

    return new Promise((resolve, reject) => {
        conn.query("SHOW CREATE TABLE `" + table + "`;", function (err, results, fields) {

            if (err) {
                console.log(err);
                return;
            }

            results.forEach(element => {
                var table_data = element["Create Table"].split("\n");
                var i = 0;

                table_data.forEach((e) => {
                    if (i == 0) {
                        ++i;
                        return;
                    }

                    if (i == table_data.length - 1) {
                        ++i;
                        return;
                    }

                    var column = e.trim().split(" ");

                    var field_name = column[0].replace(/`/g, "").trim();
                    var type       = column[1].replace(")", "").trim().split('(');

                    if(field_name == "PRIMARY" || field_name == "KEY" || field_name == ")") {
                        return;
                    }

                    tables[table].fields[field_name] = type[0] + ":" + type[1];

                    ++i;
                });
            });
            
            resolve();
        });
    });
}

if (argv._[0] == "migrate:down") {
    var config = require('./migrate_config/config.json');
    tables = {};
    getConnection().query("show tables;", function (err, results, fields) {
        if (err) {
            console.log(err);
            return;
        }

        results.forEach(element => {
            var table_name = element["Tables_in_" + config.database.database];
            console.log(tables);
            parseTable(table_name).then(() => {
                fs.writeFile("./migrate_config/models.json",
                jsonFormat(tables,{type: 'space',
                size: 4}),
                function (err) {
                    if (err) {
                        console.log(err);
                    }
                });
            });
        });

        return;
    });
}

function getLaravelFieldType(type) {
    switch(type.split(":")[0]) {
        case "varchar":
        case "text":
        case "longtext":
            return "string";
        case "int":
        case "bigint":
        case "tinyint":
            return "integer";
        case "date":
        case "datetime":
        case "timestamp":
            return "date";
    }
}

function generateLaravelMigrations() {
    var template = `<?php

        use Illuminate\Database\Schema\Blueprint;
        use Illuminate\Database\Migrations\Migration;

        class {table_name}_update extends Migration {
            public function up()
            {
                Schema::table("{table_name}", function(Blueprint $table) {
                    {table_details}
                });
            }

            public function down()
            {
                Schema::dropIfExists("{table_name}");
            }
        }
    `;

    var fields = [];

    _.each(require("./migrate_config/models.json"), function(value, key) {
        console.log("Processing table " + key);
        _.each(value, function(n,m) {
            if(m == "fields") {
                _.each(n, function(v,k) {
                    fields.push("\t\t\t\t\t\t$table->"+getLaravelFieldType(v)+"(\""+k+"\");"); 
                });
                if(!fs.existsSync("./laravel_migrations/")){
                    fs.mkdirSync("./laravel_migrations/");
                }
                fs.writeFile("./laravel_migrations/" + key + "_migration.php", template.replace(/\{table_name\}/g, key).replace(/\{table_details\}/, fields.join("\n")), function(err) {
                    if (err) {
                        console.log(err);
                    }
                });
            }
        });
    });

}

if (argv._[0].startsWith("convert")) {
    var spl = argv._[0].split(":");
    switch(spl[1]) {
        case "laravel":
            generateLaravelMigrations();
            break;
    }
}