import {
  collection, collectionGroup, doc, onSnapshot, query, where,
  type FirestoreError, type QueryDocumentSnapshot, type Timestamp, type Unsubscribe,
} from "firebase/firestore";

import { isSharePermission, type ClientShare } from "@/lib/domain/client-sharing";
import { isDocumentId, type Client, type Invoice, type Project } from "@/lib/domain/model";
import { getFirebaseFirestore } from "./client";

export interface ShareRecord extends ClientShare {
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SharedRecords {
  clients: Client[];
  projects: Project[];
  invoices: Invoice[];
  shares: Map<string, ShareRecord>;
  loading: boolean;
}

interface ProjectScope {
  project: Project;
  invoices?: Invoice[];
  stop?: Unsubscribe;
}

interface ClientScope {
  share: ShareRecord;
  client?: Client | null;
  projects?: Map<string, ProjectScope>;
  stop: Unsubscribe[];
}

function shareRecord(snapshot: QueryDocumentSnapshot) {
  const share = snapshot.data() as ShareRecord;
  return isDocumentId(share.clientId) && isDocumentId(share.ownerId) &&
    isSharePermission(share.permission) && snapshot.id === share.sharedUserId &&
    snapshot.ref.parent.parent?.id === share.clientId ? share : null;
}

const serverSnapshots = { includeMetadataChanges: true };

export function subscribeToManagedShares(
  clientId: string, receive: (shares: ShareRecord[]) => void, fail: () => void,
) {
  const members = collection(getFirebaseFirestore(), "client_shares", clientId, "client_share_members");
  return onSnapshot(members, serverSnapshots, snapshot => {
    if (!snapshot.metadata.fromCache) receive(snapshot.docs.flatMap(item => shareRecord(item) ?? []));
  }, fail);
}

export function subscribeToSharedRecords(
  uid: string, receive: (records: SharedRecords) => void, fail: () => void,
) {
  const db = getFirebaseFirestore();
  const scopes = new Map<string, ClientScope>();
  let confirmed = false;

  function publish() {
    const records: SharedRecords = { clients: [], projects: [], invoices: [], shares: new Map(), loading: !confirmed };
    for (const scope of scopes.values()) {
      if (scope.client === undefined || scope.projects === undefined) records.loading = true;
      if (!scope.client) continue;
      records.clients.push(scope.client);
      records.shares.set(scope.client.id, scope.share);
      for (const project of scope.projects?.values() ?? []) {
        records.projects.push(project.project);
        if (project.invoices === undefined) records.loading = true;
        else records.invoices.push(...project.invoices);
      }
    }
    receive(records);
  }

  function stopClient(id: string) {
    const scope = scopes.get(id);
    if (!scope) return;
    scopes.delete(id);
    scope.stop.forEach(stop => stop());
    scope.projects?.forEach(project => project.stop?.());
  }

  function listenToClient(share: ShareRecord) {
    const { ownerId, clientId } = share;
    const scope: ClientScope = { share, stop: [] };
    scopes.set(clientId, scope);

    function clientUnavailable(error: FirestoreError) {
      if (scopes.get(clientId) !== scope) return;
      stopClient(clientId);
      publish();
      if (error.code !== "permission-denied") fail();
    }

    scope.stop.push(onSnapshot(doc(db, "clients", clientId), serverSnapshots, snapshot => {
      if (snapshot.metadata.fromCache || scopes.get(clientId) !== scope) return;
      const data = snapshot.data();
      scope.client = data?.userId === ownerId ? { ...data, id: snapshot.id } as Client : null;
      publish();
    }, clientUnavailable));

    const projects = query(collection(db, "projects"), where("userId", "==", ownerId), where("client_id", "==", clientId));
    scope.stop.push(onSnapshot(projects, serverSnapshots, snapshot => {
      if (snapshot.metadata.fromCache || scopes.get(clientId) !== scope) return;
      const before = scope.projects ?? new Map<string, ProjectScope>();
      const next = new Map<string, ProjectScope>();
      scope.projects = next;
      for (const item of snapshot.docs) {
        const project = { ...item.data(), id: item.id } as Project;
        const projectScope = before.get(item.id) ?? { project };
        projectScope.project = project;
        next.set(item.id, projectScope);
        if (projectScope.stop) continue;
        const invoices = query(collection(db, "invoices"), where("userId", "==", ownerId), where("project_id", "==", item.id));
        projectScope.stop = onSnapshot(invoices, serverSnapshots, result => {
          if (result.metadata.fromCache || scopes.get(clientId) !== scope || scope.projects?.get(item.id) !== projectScope) return;
          projectScope.invoices = result.docs.map(invoice => ({ ...invoice.data(), id: invoice.id }) as Invoice);
          publish();
        }, error => {
          if (scopes.get(clientId) !== scope || scope.projects?.get(item.id) !== projectScope) return;
          projectScope.stop = undefined;
          projectScope.invoices = [];
          publish();
          if (error.code !== "permission-denied") fail();
        });
      }
      before.forEach((project, id) => { if (!next.has(id)) project.stop?.(); });
      publish();
    }, clientUnavailable));
  }

  const received = query(collectionGroup(db, "client_share_members"), where("sharedUserId", "==", uid));
  const unsubscribe = onSnapshot(received, serverSnapshots, snapshot => {
    const shares = new Map<string, ShareRecord>();
    confirmed = !snapshot.metadata.fromCache;
    if (confirmed) {
      for (const item of snapshot.docs) {
        const share = shareRecord(item);
        if (share?.sharedUserId === uid && share.ownerId !== uid) shares.set(share.clientId, share);
      }
    }
    for (const [id, scope] of scopes) {
      const next = shares.get(id);
      if (!next || next.ownerId !== scope.share.ownerId ||
          next.createdAt?.toMillis() !== scope.share.createdAt?.toMillis()) stopClient(id);
    }
    for (const [id, share] of shares) {
      const scope = scopes.get(id);
      if (scope) scope.share = share;
      else listenToClient(share);
    }
    publish();
  }, () => {
    scopes.forEach((_, id) => stopClient(id));
    publish();
    fail();
  });

  return () => {
    unsubscribe();
    scopes.forEach((_, id) => stopClient(id));
  };
}
