import Foundation

class {{appName}}LynxGenericResourceFetcher:NSObject, LynxGenericResourceFetcher{
    func fetchResource(_ request: LynxResourceRequest, onComplete callback: @escaping LynxGenericResourceCompletionBlock) -> () -> Void {
        if let url = URL(string: request.url) {
            let task = URLSession.shared.dataTask(with: url) { data, response, error in
                if let error = error {
                    callback(nil, error)
                } else {
                    callback(data, nil)
                }
            }
            task.resume()
        } else {
            let error = NSError(
                domain: "{{appName}}LynxGenericResourceFetcher",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid URL string: \(request.url)"]
            )
            callback(nil, error)
        }
        return {}
    }
    
    func fetchResourcePath(_ request: LynxResourceRequest, onComplete callback: @escaping LynxGenericResourcePathCompletionBlock) -> () -> Void {
        let error = NSError(
            domain: "{{appName}}LynxGenericResourceFetcher",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: "Not implemented yet"]
        )
        callback(nil, error)
        return {}
    }
}

