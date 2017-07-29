export =[
    {
        method: 'POST',
        path: '/vision',
        handler: { act: 'role:visionRequest, cmd:visionTask1' } // will hit the registerDevice pattern using funky jsonic syntax
    }
];