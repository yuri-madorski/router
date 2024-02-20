import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import * as L from 'leaflet';
import * as turf from '@turf/turf';
import * as JSZip from 'jszip';
import JSZipUtils from 'jszip-utils';
import { read, utils, writeFile, writeFileXLSX } from 'xlsx';

var createGraph = require('ngraph.graph');
var createPath = require('ngraph.path');

export class Node {
  id: number;
  lat: number;
  lon: number;
  next_nodes: {
    id: number;
    path?: number[];
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
      this.map = L.map('map', {
        center: [this.lat, this.lng],
        zoom: 8,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '&copy; Turf', }).addTo(this.map);
    })();
  }
  file: any;
  file_loading = false;
  dataJSON: any;
  stop_names: string[] = [];
  terminal_stops = [];
  terminal_stops_nodes = [];
  terminal_stops_on_map: any[] = [];
  depots_stops_on_map: any[] = [];
  sel_depot: any;
  sel_depot_on_map: any;
  desired_routes: {
    start_node?: number;
    start_node_on_map?: any;
    start_stop: any;
    end_node?: number;
    end_node_on_map?: any;
    end_stop: any;
    distance: number;
    time: number;
    on_map?: any;
    nodes?: any;
    is_deadhead?: boolean;
    pull_closest_index?: number;
  }[] = [];
  include_deadheads = false;
  rows: DHRow[] = [];
  produceXLSX() {
    this.rows = [];
    for (let dr of this.desired_routes.filter(el => el.distance <= this.max_distance && (el.is_deadhead === false || (el.is_deadhead && this.include_deadheads)) && (el.is_deadhead === true || (el.pull_closest_index <= this.pull_closest_count)))) {
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
  pull_closest_count = 2;
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
        console.log('depots', this.depots);
        for (let route of this.dataJSON.routes) {
          let stop = this.dataJSON.stops.find(el => el.id == route.trace_points[0].point);
          if (stop !== undefined && this.terminal_stops.indexOf(stop) == -1)
            this.terminal_stops.push(stop);
          stop = this.dataJSON.stops.find(el => el.id == route.trace_points[route.trace_points.length - 1].point);
          if (stop !== undefined && this.terminal_stops.indexOf(stop) == -1)
            this.terminal_stops.push(stop);
        }
        console.log('terminal_stops', this.terminal_stops);
        for (let ts of this.depots) {
          this.depots_stops_on_map.push(L.circle([ts.lat, ts.long], { color: 'red' }).bindTooltip(ts.id).addTo(this.map));
        }
        console.log('depots_stops_on_map', this.depots_stops_on_map);
        let dr_index = [];
        for (let ts of this.terminal_stops) {
          this.terminal_stops_on_map.push(L.circle([ts.lat, ts.long]).bindTooltip(ts.id).addTo(this.map));
          for (let depot of this.depots) {
            if (depot.id == ts.id) continue;
            this.desired_routes.push({
              start_stop: depot,
              end_stop: ts,
              distance: Math.round(turf.distance([depot.long, depot.lat], [ts.long, ts.lat]) * 1000) / 1000,
              time: null,
              is_deadhead: false,
              pull_closest_index: 0
            });
            dr_index.push(depot.id + '-' + ts.id);
            this.desired_routes.push({
              start_stop: ts,
              end_stop: depot,
              distance: Math.round(turf.distance([depot.long, depot.lat], [ts.long, ts.lat]) * 1000) / 1000,
              time: null,
              is_deadhead: false,
              pull_closest_index: 0
            });
            dr_index.push(ts.id + '-' + depot.id);
          }
          for (let ts1 of this.terminal_stops) {
            if (ts1.id == ts.id) continue;

            //if (this.desired_routes.find(el => el.start_stop == ts1 && el.end_stop == ts) === undefined) {
            //console.log(ts1.id + '-' + ts.id, dr_index.indexOf(ts1.id + '-' + ts.id))
            if (dr_index.indexOf(ts1.id + '-' + ts.id) === -1) {
              this.desired_routes.push({
                start_stop: ts1,
                end_stop: ts,
                distance: Math.round(turf.distance([ts1.long, ts1.lat], [ts.long, ts.lat]) * 1000) / 1000,
                time: null,
                is_deadhead: true
              });
              dr_index.push(ts1.id + '-' + ts.id);
            }
            //if (this.desired_routes.find(el => el.start_stop == ts && el.end_stop == ts1) === undefined) {
            //console.log(ts.id + '-' + ts1.id, dr_index.indexOf(ts.id + '-' + ts1.id))
            if (dr_index.indexOf(ts.id + '-' + ts1.id) === -1) {
              this.desired_routes.push({
                start_stop: ts,
                end_stop: ts1,
                distance: Math.round(turf.distance([ts1.long, ts1.lat], [ts.long, ts.lat]) * 1000) / 1000,
                time: null,
                is_deadhead: true
              });
              dr_index.push(ts.id + '-' + ts1.id);
            }
          }
        }
        console.log('desired_routes', this.desired_routes.length);
        for (let ts of this.terminal_stops) {
          let pull_outs = this.desired_routes.filter(el => el.end_stop == ts && el.is_deadhead == false);
          pull_outs.sort((a, b) => { return (a.distance > b.distance) ? 1 : -1; });
          let index = 1;
          for (let pull of pull_outs) {
            pull.pull_closest_index = index;
            index += 1;
          }
        }
        for (let ts of this.terminal_stops) {
          let pull_ins = this.desired_routes.filter(el => el.start_stop == ts && el.is_deadhead == false);
          pull_ins.sort((a, b) => { return (a.distance > b.distance) ? 1 : -1; });
          let index = 1;
          for (let pull of pull_ins) {
            pull.pull_closest_index = index;
            index += 1;
          }
        }
        this.desired_routes.sort((a, b) => { return (a.distance > b.distance) ? 1 : -1; });
        console.log('desired_routes', this.desired_routes.map(el => [el.start_stop.id, el.end_stop.id]));
        let features = turf.points(this.terminal_stops.map(el => [parseFloat(el.long), parseFloat(el.lat)]), this.depots.map(el => [parseFloat(el.long), parseFloat(el.lat)]));
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
        L.geoJSON(turf.bboxPolygon(bbox), { style: { fill: false } }).addTo(this.map);
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
  graph = createGraph();
  graph_links = {};
  getOSMData() {
    this.http.get('https://overpass-api.de/api/interpreter?data=[out:json][timeout:300];(' +
      'way["highway"="motorway"](' + this.bbox + ');' +
      'way["highway"="motorway_link"](' + this.bbox + ');' +
      'way["highway"="trunk"](' + this.bbox + ');' +
      'way["highway"="trunk_link"](' + this.bbox + ');' +
      'way["highway"="primary"](' + this.bbox + ');' +
      'way["highway"="primary_link"](' + this.bbox + ');' +
      'way["highway"="secondary"](' + this.bbox + ');' +
      'way["highway"="secondary_link"](' + this.bbox + ');' +
      'way["highway"="tertiary"](' + this.bbox + ');' +
      'way["highway"="tertiary_link"](' + this.bbox + ');' +
      'way["highway"="residential"]["access"!="private"]["access"!="permissive"](' + this.bbox + ');' +
      'way["highway"="living_street"](' + this.bbox + ');' +
      'way["highway"="unclassified"](' + this.bbox + ');' +
      'way["highway"="service"](' + this.bbox + ');' +
      'way["highway"="service"]["bus"](' + this.bbox + ');' +
      ');out;>;out skel qt;').subscribe((data: any) => {
        //this.http.get('https://overpass-api.de/api/interpreter?data=[out:json][timeout:300];(way["highway"="motorway"](' + this.bbox + ');way["highway"="motorway_link"](' + this.bbox + ');way["highway"="trunk"](' + this.bbox + ');way["highway"="trunk_link"](' + this.bbox + ');way["highway"="primary"](' + this.bbox + ');way["highway"="secondary"](' + this.bbox + ');way["highway"="secondary_link"](' + this.bbox + ');way["highway"="tertiary"](' + this.bbox + ');way["highway"="residential"]["access"!="private"]["access"!="permissive"](' + this.bbox + ');way["highway"="living_street"](' + this.bbox + ');way["highway"="unclassified"](' + this.bbox + ');way["highway"="service"]["bus"](' + this.bbox + '););out;>;out skel qt;').subscribe((data: any) => {
        console.log('data received');
        for (let el of data.elements) {
          if (el.type == 'node') {
            let on_map = L.circle([el.lat, el.lon], { radius: 1, opacity: .5, color: '#a77' })
              .on('click', e => { this.showWaysFromPoint(el.id) });
            this.nodes_index[el.id * 1] = { id: el.id * 1, lat: el.lat, lon: el.lon, next_nodes: [], on_map: on_map };
            this.graph.addNode(el.id * 1, { lat: el.lat, lon: el.lon });
          }
        }
        console.log('nodes created');
        console.log(this.graph);
        for (let node_id in this.nodes_index) {
          let node = this.nodes_index[node_id];
          for (let ts of this.terminal_stops) {
            if (ts['node_distance'] == undefined) ts['node_distance'] = 500;
            let dist = turf.distance([ts.long, ts.lat], [node.lon, node.lat], { units: 'meters' });
            //let dist = Math.sqrt(Math.pow(ts.long * 100 - node.lon * 100, 2) + Math.pow(ts.lat * 100 - node.lat * 100, 2));
            if (dist < ts['node_distance']) {
              ts['node_distance'] = dist;
              ts['node'] = node.id;
            }
          }
          for (let ts of this.depots) {
            if (ts['node_distance'] == undefined) ts['node_distance'] = 500;
            let dist = turf.distance([ts.long, ts.lat], [node.lon, node.lat], { units: 'meters' });
            //let dist = Math.sqrt(Math.pow(ts.long * 100 - node.lon * 100, 2) + Math.pow(ts.lat * 100 - node.lat * 100, 2));
            if (dist < ts['node_distance']) {
              ts['node_distance'] = dist;
              ts['node'] = node.id;
            }
          }
        }
        for (let ts of this.terminal_stops) {
          this.terminal_stops_nodes.push(ts['node']);
          if (this.nodes_index[ts['node']]) {
            L.circle([this.nodes_index[ts['node']].lat, this.nodes_index[ts['node']].lon], { radius: 1, opacity: .5, color: 'green' }).addTo(this.map);
            L.polyline([[ts.lat, ts.long], [this.nodes_index[ts['node']].lat, this.nodes_index[ts['node']].lon]]).addTo(this.map);
          }
        }
        for (let ts of this.depots) {
          if (this.nodes_index[ts['node']]) {
            L.circle([this.nodes_index[ts['node']].lat, this.nodes_index[ts['node']].lon], { radius: 1, opacity: .5, color: 'red' }).addTo(this.map);
            L.polyline([[ts.lat, ts.long], [this.nodes_index[ts['node']].lat, this.nodes_index[ts['node']].lon]]).addTo(this.map);
          }
        }
        console.log('terminal_stops_nodes', this.terminal_stops_nodes);
        for (let dr of this.desired_routes) {
          dr.start_node = (this.depots.map(el => el.id).indexOf(dr.start_stop.id) !== -1) ? this.depots.find(el => el.id == dr.start_stop.id).node : this.terminal_stops.find(el => el.id == dr.start_stop.id).node;
          dr.end_node = (this.depots.map(el => el.id).indexOf(dr.end_stop.id) !== -1) ? this.depots.find(el => el.id == dr.end_stop.id).node : this.terminal_stops.find(el => el.id == dr.end_stop.id).node;
        }
        //let other_dirs = {};
        for (let el of data.elements) {
          if (el.type == 'way') {
            //this.ways.push({ id: el.id, nodes: el.nodes, tags: el.tags });
            for (let pair of this.pairwise(el.nodes)) {
              let n0 = this.nodes_index[pair[0]];
              let n1 = this.nodes_index[pair[1]];
              let distance = turf.distance([n0.lon, n0.lat], [n1.lon, n1.lat]);
              let n_speed = (el.tags['maxspeed']) ? parseInt(el.tags['maxspeed']) : this.default_speed;
              let time = (distance / n_speed) * 60;
              this.graph.addLink(pair[0] * 1, pair[1] * 1, { distance: distance, time: time });
              this.graph_links[(pair[0] * 1) + '_' + (pair[1] * 1)] = { distance: distance, time: time };
              //this.nodes_index[pair[0]].next_nodes.push({ id: pair[1], distance: distance, tags: el.tags, path: [] });
              let other_dir = true;
              if (el.tags['junction'] && el.tags['junction'] == 'roundabout') other_dir = false;
              if (el.tags['oneway'] == 'yes' && el.tags['oneway:psv'] !== 'no' && el.tags['oneway:bus'] !== 'no') other_dir = false;
              if (other_dir) {
                this.graph.addLink(pair[1] * 1, pair[0] * 1, { distance: distance, time: time });
                //  this.nodes_index[pair[1]].next_nodes.push({ id: pair[0], distance: distance, tags: el.tags, path: [] });
              }
              this.graph_links[(pair[1] * 1) + '_' + (pair[0] * 1)] = { distance: distance, time: time };
              //other_dirs[(pair[1] * 1) + '_' + (pair[0] * 1)] = {od:other_dir,tags:el.tags};
            }
          }
        }
        //console.log('other_dirs => ', other_dirs);
        console.log('graph_links => ', this.graph_links);
        console.log('ready');
        this.ready_state = true;
        this.is_loading -= 1;
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
  async findWays() {
    let start_time = new Date().getTime() / 1000;
    this.idr = 0;
    this.calc_done = 0;
    this.total_to_calc = this.desired_routes.filter(dr => dr.distance < this.max_distance && (dr.is_deadhead === false || (dr.is_deadhead && this.include_deadheads)) && (dr.is_deadhead === true || (dr.pull_closest_index <= this.pull_closest_count))).length;
    console.log('start => ', start_time, this.calc_done, this.total_to_calc);
    for (let dr of this.desired_routes) {
      if (dr.distance < this.max_distance && (dr.is_deadhead === false || (dr.is_deadhead && this.include_deadheads)) && (dr.is_deadhead === true || (dr.pull_closest_index <= this.pull_closest_count))) {
        this.idr += 1;
        this.is_loading += 1;
        setTimeout(() => {
          this.findWayBetween(dr, dr.start_node, dr.end_node).then(() => {
            this.is_loading -= 1;
            this.calc_done += 1;
            dr.distance = Math.round(dr.distance * 1000) / 1000;
            dr.time = Math.ceil(dr.time);
            if (this.is_loading == 0) {
              console.log('finished in => ', new Date().getTime() / 1000 - start_time, 'seconds', this.calc_done, this.total_to_calc);
              //this.calc_done = 0;
            }
          });
        }, 500);

      }
    }
  }
  log_calcs = false;
  async findWayBetween(desired_route, node1: number, node2: number) {
    let pathFinder = createPath.aGreedy(this.graph, {
      oriented: true,
      distance(fromNode, toNode, link) {
        return link.data.time;
      }
    });
    let path = pathFinder.find(node1, node2);
    desired_route.nodes = path.map(el => el.id);
    desired_route.distance = 0;
    desired_route.time = 0;
    //console.log(node1, node2, desired_route, path);
    if (desired_route.nodes.length > 1)
      for (let np of this.pairwise(desired_route.nodes)) {
        desired_route.distance += turf.distance([this.nodes_index[np[0]].lon, this.nodes_index[np[0]].lat], [this.nodes_index[np[1]].lon, this.nodes_index[np[1]].lat]);
        let glink = this.graph_links[np[0] + '_' + np[1]];
        if (glink) desired_route.time += glink.time;
        if (this.log_calcs) console.log(np[0] + '_' + np[1], glink);
      }
    this.log_calcs = false;
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
  max_distance: number = 15;
  final_routes: Route[] = [];
  routes_on_map: { visible: boolean, shape: any }[] = [];
  steps = 0;
  ready_state = false;
  idr = 0;
  total_to_calc = 1;
  calc_done = 0;
  toggleRouteOnMap(desired_route) {
    if (desired_route.on_map === undefined) {
      desired_route.on_map = L.polyline(desired_route.nodes.map(el => [this.nodes_index[el].lat, this.nodes_index[el].lon])).addTo(this.map);
    } else {
      desired_route.on_map.remove();
      desired_route.on_map = undefined;
    }
  }
  all_on_map = false;
  toggleAllRouteOnMap() {
    //this.all_on_map = !this.all_on_map;
    for (let desired_route of this.desired_routes) {
      if (this.all_on_map) {
        if (desired_route.on_map !== undefined) {
          desired_route.on_map.remove();
          desired_route.on_map = undefined;
        }
        if (desired_route.nodes) desired_route.on_map = L.polyline(desired_route.nodes.map(el => [this.nodes_index[el].lat, this.nodes_index[el].lon])).addTo(this.map);
      } else {
        if (desired_route.on_map !== undefined) {
          desired_route.on_map.remove();
          desired_route.on_map = undefined;
        }
      }
    }
  }
  toggleAerialOnMap(desired_route) {
    if (desired_route.aerial_on_map === undefined) {
      desired_route.aerial_on_map = L.polyline([[this.nodes_index[desired_route.start_node].lat, this.nodes_index[desired_route.start_node].lon], [this.nodes_index[desired_route.end_node].lat, this.nodes_index[desired_route.end_node].lon]]).addTo(this.map);
    } else {
      desired_route.aerial_on_map.remove();
      desired_route.aerial_on_map = undefined;
    }
  }
}