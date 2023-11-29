import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import * as L from 'leaflet';
import * as turf from '@turf/turf';
import * as JSZip from 'jszip';
import JSZipUtils from 'jszip-utils';
import { read, utils, writeFile, writeFileXLSX } from 'xlsx';

export class Node {
  id: number;
  lat: number;
  lon: number;
  next_nodes: {
    id: number;
    distance: number;
    tags: any;
  }[]
  on_map: any;
  params?: any;
}
export class Way {
  id: number;
  nodes: number[];
  tags: any;
}
export class Route {
  nodes: number[];
  distance: number;
  time: number;
  time_to_end: number;
}
interface DHRow {
  "Origin Stop Id": string;
  "Destination Stop Id": string;
  "Travel Time": number;
  "Distance": number;
  "Start Time Range": string;
  "End Time Range": string;
  "Generate Time": string;
  "Route Id": string;
  "Origin Stop Name": string;
  "Destination Stop Name": string;
  "Days Of Week": string;
  "Direction": string;
  "Purpose": string;
  "Alignment": string;
  "Pre-Layover Time": string;
  "Post-Layover Time": string;
  "updatedAt": string;
};
@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss']
})
export class MapComponent implements OnInit {
  constructor(
    private http: HttpClient
  ) { }
  public is_loading = 0;
  public lat = 52;
  public lng = 0;
  public map: any;
  public overpass_query = '';
  public bbox: any = '51.59253563764556,0.053386688232421875,51.61684410110071,0.11745929718017578';
  ngOnInit(): void {
    (async () => {
      //this.is_loading += 1;
      this.map = L.map('map', {
        center: [this.lat, this.lng],
        zoom: 8,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '&copy; Turf', }).addTo(this.map);
      //L.tileLayer('https://mt0.google.com/vt/lyrs=m@221097413,traffic&x={x}&y={y}&z={z}', { maxZoom: 19, attribution: '&copy; Turf', }).addTo(this.map);

      //const f = await fetch("/assets/catalogue.xlsx");
      //const ab = await f.arrayBuffer();
      //const wb = read(ab);
      //this.rows = utils.sheet_to_json<DHRow>(wb.Sheets[wb.SheetNames[0]]);
      //console.log(this.rows);
    })();
  }
  file: any;
  file_loading = false;
  dataJSON: any;
  //patterns: Pattern[] = [];
  stop_names: string[] = [];
  terminal_stops = [];
  terminal_stops_nodes = [];
  terminal_stops_on_map: any[] = [];
  sel_depot: any;
  sel_depot_on_map: any;
  desired_routes: {
    start_node?: number;
    start_stop: any;
    end_node?: number;
    end_stop: any;
    distance: number;
    time: number;
    on_map?: any;
    nodes?: any;
  }[] = [];
  rows: DHRow[] = [];
  produceXLSX() {
    this.rows = [];
    for (let dr of this.desired_routes) {
      this.rows.push({
        "Origin Stop Id": dr.start_stop.id,
        "Destination Stop Id": dr.end_stop.id,
        "Travel Time": dr.time,
        "Distance": dr.distance,
        "Start Time Range": '',
        "End Time Range": '',
        "Generate Time": '',
        "Route Id": '',
        "Origin Stop Name": dr.start_stop.short_description,
        "Destination Stop Name": dr.end_stop.short_description,
        "Days Of Week": '',
        "Direction": '',
        "Purpose": '',
        "Alignment": '',
        "Pre-Layover Time": '',
        "Post-Layover Time": '',
        "updatedAt": ''
      });
    }
    const ws = utils.json_to_sheet(this.rows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Data");
    writeFileXLSX(wb, "DH-Catalogue.xlsx");
  }
  readJSON(e) {
    this.is_loading += 1;
    this.file_loading = true;
    console.log(e);

    this.file = e.currentFiles[0];
    const reader = new FileReader();
    reader.addEventListener(
      'load',
      () => {
        this.dataJSON = reader.result;
        this.dataJSON = JSON.parse(this.dataJSON);
        console.log('json', this.dataJSON);
        this.dataJSON.stops.sort((a, b) => (a.short_description < b.short_description) ? -1 : 1);
        this.depots = this.dataJSON.stops.filter(el => this.depot_stop_ids.indexOf(el.id) !== -1);
        for (let route of this.dataJSON.routes) {
          let stop = this.dataJSON.stops.find(el => el.id == route.trace_points[0].point);
          if (stop !== undefined && this.terminal_stops.indexOf(stop) == -1)
            this.terminal_stops.push(stop);
          stop = this.dataJSON.stops.find(el => el.id == route.trace_points[route.trace_points.length - 1].point);
          if (stop !== undefined && this.terminal_stops.indexOf(stop) == -1)
            this.terminal_stops.push(stop);
        }
        console.log('terminal_stops', this.terminal_stops);
        for (let ts of this.terminal_stops) {
          this.terminal_stops_on_map.push(L.circle([ts.lat, ts.long]).addTo(this.map));
          for (let depot of this.depots) {
            if (depot.id !== ts.id) {
              this.desired_routes.push({
                start_stop: depot,
                end_stop: ts,
                distance: Math.round(turf.distance([depot.long, depot.lat], [ts.long, ts.lat]) * 1000) / 1000,
                time: null
              });
              this.desired_routes.push({
                start_stop: ts,
                end_stop: depot,
                distance: Math.round(turf.distance([depot.long, depot.lat], [ts.long, ts.lat]) * 1000) / 1000,
                time: null
              });
            }
          }
        }
        let features = turf.points(this.terminal_stops.map(el => [parseFloat(el.long), parseFloat(el.lat)]));
        let center = turf.center(features);
        console.log('center', center);
        let bbox = turf.bbox(features);
        console.log('bbox', bbox);
        let radius = turf.distance([bbox[0], bbox[1]], center);
        console.log('radius', radius);
        bbox = turf.bbox(turf.circle(center, radius));
        console.log('bbox', bbox);
        //this.map.setView([center.geometry.coordinates[1],center.geometry.coordinates[0]],13);
        this.map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
        this.bbox = bbox[1] + ',' + bbox[0] + ',' + bbox[3] + ',' + bbox[2];
        this.getOSMData();
      },
      false
    );
    if (this.file) reader.readAsText(this.file);
    this.file_loading = false;
  }
  prefsJSON;
  depot_stop_ids = [];
  depots;
  readPreferencesJSON(e) {
    this.is_loading += 1;
    this.file_loading = true;
    console.log(e);

    this.file = e.currentFiles[0];
    const reader = new FileReader();
    reader.addEventListener(
      'load',
      () => {
        this.prefsJSON = reader.result;
        this.prefsJSON = JSON.parse(this.prefsJSON);
        this.depot_stop_ids = this.prefsJSON.find(el => el.depots !== undefined).depots.items.map(el => el.stop_id);
        console.log('depot_stop_ids', this.depot_stop_ids);
        this.is_loading -= 1;
      },
      false
    );
    if (this.file) reader.readAsText(this.file);
    this.file_loading = false;
  }
  /*depotChange() {
    this.is_loading = true;
    if (this.sel_depot_on_map) this.sel_depot_on_map.remove();
    this.sel_depot_on_map = L.circle([this.sel_depot.lat, this.sel_depot.long], { color: '#a00' }).addTo(this.map);
    let closest_node = this.findClosest(this.sel_depot.lat, this.sel_depot.long);
    console.log(this.sel_depot.lat, this.sel_depot.long);
    if (closest_node !== undefined) {
      //this.findRoutes(closest_node);
    } else {
      alert('Check depot coordinates in the timeplan');
      this.is_loading = false;
    }
  }*/
  //nodes: Node[] = [];
  ways: Way[] = [];

  pairwise(arr: number[]): number[][] {
    let arr1: number[][] = [];
    for (let i = 1; i < arr.length; i++) {
      arr1.push([arr[i - 1], arr[i]]);
    }
    return arr1;
  }
  nodes_index: Node[] = [];
  graph_shown = false;
  toggleGraphNodes() {
    for (let node_id in this.nodes_index) {
      let node = this.nodes_index[node_id];
      if (this.graph_shown) {
        node.on_map.addTo(this.map);
      } else {
        node.on_map.remove();
      }
    }
  }
  graph_name = '';
  getOSMData() {
    this.http.get('https://overpass-api.de/api/interpreter?data=[out:json][timeout:300];(way["highway"="motorway"](' + this.bbox + ');way["highway"="motorway_link"](' + this.bbox + ');way["highway"="trunk"](' + this.bbox + ');way["highway"="trunk_link"](' + this.bbox + ');way["highway"="primary"](' + this.bbox + ');way["highway"="secondary"](' + this.bbox + ');way["highway"="secondary_link"](' + this.bbox + ');way["highway"="tertiary"](' + this.bbox + ');way["highway"="residential"]["access"!="private"]["access"!="permissive"](' + this.bbox + ');way["highway"="living_street"](' + this.bbox + ');way["highway"="unclassified"](' + this.bbox + ');way["highway"="service"](' + this.bbox + ');way["highway"="service"]["bus"](' + this.bbox + '););out;>;out skel qt;').subscribe((data: any) => {
      //this.http.get('https://overpass-api.de/api/interpreter?data=[out:json][timeout:300];(way["highway"="motorway"](' + this.bbox + ');way["highway"="motorway_link"](' + this.bbox + ');way["highway"="trunk"](' + this.bbox + ');way["highway"="trunk_link"](' + this.bbox + ');way["highway"="primary"](' + this.bbox + ');way["highway"="secondary"](' + this.bbox + ');way["highway"="secondary_link"](' + this.bbox + ');way["highway"="tertiary"](' + this.bbox + ');way["highway"="residential"]["access"!="private"]["access"!="permissive"](' + this.bbox + ');way["highway"="living_street"](' + this.bbox + ');way["highway"="unclassified"](' + this.bbox + ');way["highway"="service"]["bus"](' + this.bbox + '););out;>;out skel qt;').subscribe((data: any) => {
      console.log(data);
      for (let el of data.elements) {
        if (el.type == 'node') {
          let on_map = L.circle([el.lat, el.lon], { radius: 1, opacity: .5, color: '#a77' })
            .on('click', e => { this.showWaysFromPoint(el.id) });
          this.nodes_index[el.id] = { id: el.id, lat: el.lat, lon: el.lon, next_nodes: [], on_map: on_map };
          //this.nodes.push(this.nodes_index[el.id]);
        }
      }
      console.log('nodes created');
      for (let node_id in this.nodes_index) {
        let node = this.nodes_index[node_id];
        for (let ts of this.terminal_stops) {
          if (ts['node_distance'] == undefined) ts['node_distance'] = 100;
          //let dist = turf.distance([ts.lon, ts.lat], [node.lon, node.lat], { units: 'meters' });
          let dist = Math.sqrt(Math.pow(ts.long * 100 - node.lon * 100, 2) + Math.pow(ts.lat * 100 - node.lat * 100, 2));
          if (dist < ts['node_distance']) {
            ts['node_distance'] = dist;
            ts['node'] = node.id;
          }
        }
        for (let ts of this.depots) {
          if (ts['node_distance'] == undefined) ts['node_distance'] = 100;
          //let dist = turf.distance([ts.lon, ts.lat], [node.lon, node.lat], { units: 'meters' });
          let dist = Math.sqrt(Math.pow(ts.long * 100 - node.lon * 100, 2) + Math.pow(ts.lat * 100 - node.lat * 100, 2));
          if (dist < ts['node_distance']) {
            ts['node_distance'] = dist;
            ts['node'] = node.id;
          }
        }
      }
      for (let ts of this.terminal_stops) {
        //let ts_node = this.findClosest(ts.lat, ts.long);
        //ts['node'] = ts_node;
        this.terminal_stops_nodes.push(ts['node']);
      }
      console.log('terminal_stops_nodes', this.terminal_stops_nodes);
      for (let dr of this.desired_routes) {
        dr.start_node = (this.depots.map(el => el.id).indexOf(dr.start_stop.id) !== -1) ? this.depots.find(el => el.id == dr.start_stop.id).node : this.terminal_stops.find(el => el.id == dr.start_stop.id).node;
        dr.end_node = (this.depots.map(el => el.id).indexOf(dr.end_stop.id) !== -1) ? this.depots.find(el => el.id == dr.end_stop.id).node : this.terminal_stops.find(el => el.id == dr.end_stop.id).node;
      }
      for (let el of data.elements) {
        if (el.type == 'way') {
          this.ways.push({ id: el.id, nodes: el.nodes, tags: el.tags });
          for (let pair of this.pairwise(el.nodes)) {
            this.nodes_index[pair[0]].next_nodes.push({ id: pair[1], distance: 0, tags: el.tags });
            let other_dir = true;
            if (el.tags['junction'] && el.tags['junction'] == 'roundabout') other_dir = false;
            if (el.tags['oneway'] == 'yes' && el.tags['oneway:psv'] !== 'no' && el.tags['oneway:bus'] !== 'no') other_dir = false;
            if (other_dir) {
              this.nodes_index[pair[1]].next_nodes.push({ id: pair[0], distance: 0, tags: el.tags });
            }
          }
        }
      }
      //console.log('ways', this.ways);
      console.log('next nodes filled');
      for (let n0_id in this.nodes_index) {
        let n0 = this.nodes_index[n0_id];
        for (let nn of n0.next_nodes) {
          let n1 = this.nodes_index[nn.id];
          nn.distance = turf.distance([n0.lon, n0.lat], [n1.lon, n1.lat]);
        }
      }
      console.log('distances calculated');
      console.log('nodes_index', this.nodes_index);
      this.ready_state = true;
      let aws_nodes = [];
      for (let node_id in this.nodes_index) {
        let node = this.nodes_index[node_id];
        aws_nodes.push({
          id: node.id,
          lat: node.lat,
          lon: node.lon,
          next_nodes: node.next_nodes,
        })
      }
      //console.log('nodes_index', JSON.stringify(this.nodes_index));
      let graph_name_file = String(new Date().valueOf()) + '_' + this.file.name;
      this.graph_name = graph_name_file + '.zip';
      this.is_loading -= 1;
      //this.http.post('https://6igj3zibqanqrt76fn6smiarhq0sopnv.lambda-url.eu-west-2.on.aws/',{graph_name:this.file.name,content:this.nodes},{responseType:'text'}).subscribe(data=>{
      /*this.http.post('https://6igj3zibqanqrt76fn6smiarhq0sopnv.lambda-url.eu-west-2.on.aws/', { graph_name: this.graph_name }).subscribe((data: any) => {
        console.log(data);
        console.log(graph_name_file);
        let zf = new JSZip();
        zf.file(graph_name_file, JSON.stringify(aws_nodes));
        zf.generateAsync({type:'blob', compression:'DEFLATE', compressionOptions:{level:9}}).then((blob)=> {
          console.log(blob);
          this.http.put(data.return_url, blob, { responseType: 'text' }).subscribe(data1 => {
            console.log(data1);
          });
        });
      });*/
    });
  }
  showWaysFromPoint(node_id) {
    let n0 = this.nodes_index[node_id];
    for (let nn of n0.next_nodes) {
      let n1 = this.nodes_index[nn.id];
      L.polyline([[n0.lat, n0.lon], [n1.lat, n1.lon]]).addTo(this.map);
    }
  }
  findClosest(lat: number, lon: number): number {
    let closest_node: number;
    let min_distance = 1000000;
    for (let node_id in this.nodes_index) {
      let node = this.nodes_index[node_id];
      let dist = turf.distance([lon, lat], [node.lon, node.lat], { units: 'meters' });
      if (dist < min_distance) {
        min_distance = dist;
        closest_node = node.id;
      }
    }
    return closest_node;
  }
  visited_nodes: number[] = [];
  last_iter_added: number = 0;
  routes: number[][] = [];
  terminal_nodes_routes: {
    terminal_node: number;
    distance: number;
    time: number;
    route: number[];
  }[] = [];
  default_speed = 40;
  min_time_to_nodes: number[] = [];
  min_dist_to_nodes: number[] = [];
  max_distance: number = 50;
  final_routes: Route[] = [];
  routes_on_map: { visible: boolean, shape: any }[] = [];
  steps = 0;
  ready_state = false;
  idr = 0;
  runForAll() {
    this.idr =0;
    for (let dr of this.desired_routes) {
      if (dr.distance < this.max_distance) {
        this.idr += 1;
        this.routeA(dr.start_node, dr.end_node);
        console.log(dr.distance, this.max_distance, this.idr, 'routeA => ', dr.start_node, dr.end_node);
      }
    }
  }
  routeA(from_node, to_node) {
    console.log(' => routeA', from_node, to_node);
    this.is_loading += 1;
    let new_queue: Route[] = [];
    let found = false;
    for (let nn of this.nodes_index[from_node].next_nodes) {
      this.min_dist_to_nodes[nn.id] = nn.distance;
      this.min_time_to_nodes[nn.id] = (nn.distance / 40) * 60;
      let n_speed = (nn.tags['maxspeed']) ? parseInt(nn.tags['maxspeed']) : this.default_speed;
      new_queue.push({
        nodes: [from_node, nn.id],
        distance: nn.distance,
        time: (nn.distance / n_speed) * 60,
        time_to_end: turf.distance([this.nodes_index[nn.id].lon, this.nodes_index[nn.id].lat], [this.nodes_index[to_node].lon, this.nodes_index[to_node].lat]) / 40 * 60
        //time_to_end: Math.sqrt(Math.pow(this.nodes_index[nn.id].lon * 100 - this.nodes_index[to_node].lon * 100, 2) + Math.pow(this.nodes_index[nn.id].lat * 100 - this.nodes_index[to_node].lat * 100, 2))
      });
      new_queue.sort((a, b) => { return (a.time + a.time_to_end > b.time + b.time_to_end) ? 1 : -1 });
      //console.log(new_queue);
    }
    let steps = 0;
    while (!found && steps < 10000 && new_queue[0].distance < this.max_distance) {
      steps += 1;
      let queue0 = new_queue[0];
      for (let nn of this.nodes_index[queue0.nodes[queue0.nodes.length - 1]].next_nodes) {
        this.min_dist_to_nodes[nn.id] = nn.distance;
        this.min_time_to_nodes[nn.id] = (nn.distance / 40) * 60;
        let n_speed = (nn.tags['maxspeed']) ? parseInt(nn.tags['maxspeed']) : this.default_speed;
        if (queue0.nodes.indexOf(nn.id) === -1)
          new_queue.push({
            nodes: [...queue0.nodes, nn.id],
            distance: queue0.distance + nn.distance,
            time: queue0.time + (nn.distance / n_speed) * 60,
            //time_to_end: turf.distance([this.nodes_index[nn.id].lon, this.nodes_index[nn.id].lat], [this.nodes_index[to_node].lon, this.nodes_index[to_node].lat]) * 60
            time_to_end: 10*Math.sqrt(Math.pow(this.nodes_index[nn.id].lon * 100 - this.nodes_index[to_node].lon * 100, 2) + Math.pow(this.nodes_index[nn.id].lat * 100 - this.nodes_index[to_node].lat * 100, 2))
          });
      }
      new_queue.splice(0, 1);
      new_queue.sort((a, b) => { return (a.time + a.time_to_end > b.time + b.time_to_end) ? 1 : -1 });
      if (new_queue[0].nodes[new_queue[0].nodes.length - 1] == to_node) {
        found = true;
        this.desired_routes.find(el => el.start_node == from_node && el.end_node == to_node).distance = Math.round(new_queue[0].distance * 1000) / 1000;
        this.desired_routes.find(el => el.start_node == from_node && el.end_node == to_node).time = Math.round(new_queue[0].time);
        this.desired_routes.find(el => el.start_node == from_node && el.end_node == to_node).nodes = new_queue[0].nodes;
        console.log(' => found', from_node, to_node, new_queue[0]);
      }
      //if (steps % 100 == 0) console.log(steps, new_queue[0]);
    }
    //new_queue = undefined;
    this.is_loading -= 1;
  }
  toggleRouteOnMap(desired_route) {
    if (desired_route.on_map === undefined) {
      desired_route.on_map = L.polyline(desired_route.nodes.map(el => [this.nodes_index[el].lat, this.nodes_index[el].lon])).addTo(this.map);
    } else {
      desired_route.on_map.remove();
      desired_route.on_map = undefined;
    }

  }
}