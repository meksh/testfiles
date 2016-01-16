/* global add_completion_callback */

// Reusable module for establishing 2-way communication with ft_webdriver.
window.__testharness__client__proxy__ = (function () {
    "use strict";

    // Queue of promise resolver callbacks for pending send() results.
    let pendingResults = [];
    
    // A Promise that is fullfilled when all currently pending 'send()' calls have recieved
    // thier responses.  (awaited and updated inside 'send()')
    let allCompleted = new Promise((accept) => {
        // We initialize allCompleted() with an initial unresolved Promise that no one observes.
        //
        // ft_webdriver's injected bootstrap script fulfills this Promise by invoking
        // 'resolve()'with the first '/executeAsync' callback (and an undefined previousResult).
        pendingResults.push(accept);
    });
    
    // The current callback from '/executeAsync', invoked by send() to return a message to
    // 'ft_webdriver' and updated by 'resolve()' when ft_webdriver responds.
    let sendCallback;

    // Called by page script to request that the ft_webdriver client execute a command on the
    // page's behalf (the command to execute is encoded in the JSON payload).
    function send(json) {
        // Hold on to the prior value of 'allComplete'.  Below, we will need to await all
        // previous 'send()' invocations completing before invoking 'sendCallback()'.
        const previousCompleted = allCompleted;
        
        // Create a Promise for the asynchronous response and queue it.  This Promise also
        // becomes the new value of 'allCompleted' so that the next call to 'send()' will first
        // wait for this one to finish.
        const result = allCompleted = new Promise((accept) => {
            pendingResults.push(accept);
        });

        // When ft_webdriver has responded to all previously queued 'send()'s, it's our turn.
        // (Note that Promise semantics implicitly defers the outgoing command, even when
        // 'previousCompleted' is already resolved.)
        previousCompleted.then(() => {
            // Send our response to ft_webdriver.
            sendCallback(json);
            
            // The callback cannot be used again.  Drop our reference to help make errors more
            // apparent.
            sendCallback = null;
        });

        // Return the Promise for ft_webdriver's response to the caller.
        return result;
    }

    // Invoked by ft_webdriver to notify us of the result of last 'sendCallback()' and to
    // provide us with the next '/executeAsync' callback.
    function resolve(nextCallback, previousResult) {
        sendCallback = nextCallback;

        // Dequeue the resolver callback for the previously invoked sendCallback and invoke
        // it with the result from ft_webdriver.
        //
        // This same Promise signals that the '/executeAsync' callback is available and
        // therefore releases the next outgoing message.  
        pendingResults.shift()(previousResult);
    }

    // 'cede' is a no-op command issued by the page to return from it's long running
    // '/executeAsync', thus transfering control back to 'ft_webdriver'.
    //
    // This allows 'ft_webdriver' to push pending notifications to the page via '/execute'.
    // Once 'ft_webdriver' has finished processing it's queue of pending notifications,
    // 'ft_webdriver' returns control to the page with a another long-running
    // '/executeAsync'.
    function cede() {
        return send(
            JSON.stringify({
                "id": 3,                // = ft_webdriver.Json.ClientCommands.CedeCommand
            }));
    }

    return {
        cede: cede,
        send: send,
        resolve: resolve
    }
}());

(function() {
    'use strict';
    
    add_completion_callback(
        function (tests, harness_status) {
            window.__testharness__client__proxy__.send(JSON.stringify({
                "id": 1,        // id: 1 -> report test results.  (See ft_webdriver\JSON\Commands.cs)
                "results": {
                    "test": window.location.href,
                    "tests": tests.map(function(test) {
                        return {
                            "name": test.name,
                            "status": test.status,
                            "message": test.message,
                            "stack": test.stack
                        };
                    }),
                    "status": harness_status.status,
                    "message": harness_status.message,
                    "stack": harness_status.stack
                }
            }));
        });
}());
