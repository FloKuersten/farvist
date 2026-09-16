export const Reply = ({ state }: { state: string }) => (
  <div className="message">
    <div className={"message-bubble prose prose-sm"}>ok</div>
    <span className={`status status-${state}`}>dynamic</span>
    <button className="btn btn-glas">typo in jsx</button>
  </div>
);
