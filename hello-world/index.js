const {Server} = require('hapi');

(async () => {
    const server = new Server({
        host: '0.0.0.0',
        port: 5555
    });

    server.route({
        method: 'GET',
        path: '/',
        handler: () => 'Hello world!'
    });

    try {
        await server.start();

        console.log(`Server running at ${server.info.uri}`);
    } catch (error) {
        console.error(error);

        process.exit(1);
    }
})();
